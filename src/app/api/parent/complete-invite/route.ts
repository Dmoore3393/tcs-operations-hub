import { safeFamilyAccess } from "@/lib/family-access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type DbRow = Record<string, unknown>;

function object(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DbRow : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function errorResponse(error: unknown) {
  if (error instanceof Response) return error;
  const message = error instanceof Error ? error.message : "Could not finish Parent Portal account setup.";
  return Response.json({ error: message }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!token) throw new Response("Your invitation session is missing or expired.", { status: 401 });

    const admin = createSupabaseAdminClient();
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) {
      throw new Response("Your invitation session is invalid or expired. Open the invitation email again.", { status: 401 });
    }

    const user = userData.user;
    const email = (user.email || "").trim().toLowerCase();
    if (!email) throw new Response("A verified email address is required.", { status: 403 });

    const { data: rows, error } = await admin
      .from("children")
      .select("id,organization_id,location_id,legacy_id,enrollment_status,record_data")
      .neq("enrollment_status", "Archived");

    if (error) throw error;

    const now = new Date().toISOString();
    let matched = 0;
    let activated = 0;

    for (const rawRow of (rows ?? []) as unknown as DbRow[]) {
      const record = object(rawRow.record_data);
      const adults = safeFamilyAccess(record.familyAccess);

      if (adults.length === 0) {
        if (text(record.guardianEmail).toLowerCase() === email) matched += 1;
        continue;
      }

      const adult = adults.find((entry) => entry.email === email && entry.status !== "Suspended");
      if (!adult) continue;
      matched += 1;

      if (adult.status === "Active" && adult.authUserId === user.id) continue;

      const nextAdults = adults.map((entry) => entry.id === adult.id
        ? {
            ...entry,
            status: "Active" as const,
            authUserId: user.id,
            acceptedAt: entry.acceptedAt || now,
          }
        : entry);

      const update = await admin
        .from("children")
        .update({
          record_data: { ...record, familyAccess: nextAdults },
          updated_by: user.id,
        })
        .eq("id", text(rawRow.id))
        .select("id")
        .maybeSingle();

      if (update.error) throw update.error;
      if (!update.data) throw new Error("A Parent Portal child access record could not be activated.");

      activated += 1;

      await admin.from("audit_log").insert({
        organization_id: text(rawRow.organization_id),
        location_id: text(rawRow.location_id) || null,
        actor_user_id: user.id,
        action: "UPDATE",
        table_name: "children",
        row_id: text(rawRow.id),
        metadata: {
          kind: "parent_portal_invitation_accepted",
          childLegacyId: text(rawRow.legacy_id),
          adultAccessId: adult.id,
        },
      });
    }

    if (!matched) {
      throw new Response(
        "This invited email is not connected to an active TCS child account. Contact your TCS location before continuing.",
        { status: 403 },
      );
    }

    return Response.json({ ok: true, activated });
  } catch (error) {
    return errorResponse(error);
  }
}
