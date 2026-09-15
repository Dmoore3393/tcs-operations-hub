import "server-only";

import { familyAccessForEmail, safeFamilyAccess, type FamilyAdultAccess } from "@/lib/family-access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient, User } from "@supabase/supabase-js";

type DbRow = Record<string, unknown>;

function object(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DbRow : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export type ParentChildAccess = {
  rowId: string;
  organizationId: string;
  locationId: string;
  legacyId: string;
  record: DbRow;
  access: FamilyAdultAccess;
};

export type AuthorizedParent = {
  admin: SupabaseClient;
  user: User;
  email: string;
  children: ParentChildAccess[];
};

export async function requireParent(request: Request): Promise<AuthorizedParent> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) throw new Response("Parent sign-in is required.", { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) throw new Response("Your parent session is invalid or expired.", { status: 401 });

  const email = (userData.user.email || "").trim().toLowerCase();
  if (!email) throw new Response("A verified email address is required for Parent Portal access.", { status: 403 });

  const { data: rows, error } = await admin
    .from("children")
    .select("id,organization_id,location_id,legacy_id,enrollment_status,record_data")
    .neq("enrollment_status", "Archived");

  if (error) throw error;

  const children = ((rows ?? []) as unknown as DbRow[])
    .map((row): ParentChildAccess | null => {
      const record = object(row.record_data);
      const access = familyAccessForEmail(record, email);
      if (!access) return null;

      return {
        rowId: text(row.id),
        organizationId: text(row.organization_id),
        locationId: text(row.location_id),
        legacyId: text(row.legacy_id),
        record,
        access,
      };
    })
    .filter((item): item is ParentChildAccess => Boolean(item));

  if (!children.length) {
    const pendingApproval = ((rows ?? []) as unknown as DbRow[]).some((row) => {
      const record = object(row.record_data);
      return safeFamilyAccess(record.familyAccess).some(
        (entry) => entry.email === email && entry.status === "Pending Approval",
      );
    });

    throw new Response(
      pendingApproval
        ? "Your Parent Portal account is created and waiting for TCS staff approval. Child information stays locked until approval is complete."
        : "This email is not linked to an active TCS child account. Contact your TCS location to verify your Parent Portal access.",
      { status: 403 },
    );
  }

  return { admin, user: userData.user, email, children };
}

export function parentErrorResponse(error: unknown) {
  if (error instanceof Response) return error;
  const message = error instanceof Error ? error.message : "Unexpected Parent Portal error.";
  return Response.json({ error: message }, { status: 500 });
}
