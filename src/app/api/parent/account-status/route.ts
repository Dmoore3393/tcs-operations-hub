import { safeFamilyAccess } from "@/lib/family-access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type DbRow = Record<string, unknown>;

function object(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DbRow : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: Request) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!token) return Response.json({ error: "Parent sign-in is required." }, { status: 401 });

    const admin = createSupabaseAdminClient();
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) {
      return Response.json({ error: "Your Parent Portal session is invalid or expired." }, { status: 401 });
    }

    const email = (userData.user.email || "").trim().toLowerCase();
    if (!email) return Response.json({ error: "A verified email address is required." }, { status: 403 });

    const { data: rows, error } = await admin
      .from("children")
      .select("enrollment_status,record_data")
      .neq("enrollment_status", "Archived");

    if (error) throw error;

    let activeCount = 0;
    let pendingApprovalCount = 0;
    let invitedCount = 0;
    let suspendedCount = 0;
    let legacyCount = 0;

    for (const row of (rows ?? []) as unknown as DbRow[]) {
      const record = object(row.record_data);
      const adults = safeFamilyAccess(record.familyAccess);

      if (adults.length === 0) {
        if (text(record.guardianEmail).toLowerCase() === email) legacyCount += 1;
        continue;
      }

      const adult = adults.find((entry) => entry.email === email);
      if (!adult) continue;

      if (adult.status === "Active") activeCount += 1;
      else if (adult.status === "Pending Approval") pendingApprovalCount += 1;
      else if (adult.status === "Invited") invitedCount += 1;
      else if (adult.status === "Suspended") suspendedCount += 1;
    }

    const hasActiveAccess = activeCount + legacyCount > 0;
    return Response.json({
      email,
      hasActiveAccess,
      activeCount: activeCount + legacyCount,
      pendingApprovalCount,
      invitedCount,
      suspendedCount,
      state: hasActiveAccess
        ? "Active"
        : pendingApprovalCount > 0
          ? "Pending Approval"
          : invitedCount > 0
            ? "Invited"
            : suspendedCount > 0
              ? "Suspended"
              : "No Access",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not verify Parent Portal account status.";
    return Response.json({ error: message }, { status: 500 });
  }
}
