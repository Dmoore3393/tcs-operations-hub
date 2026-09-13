import "server-only";

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
      const guardianEmail = text(record.guardianEmail).toLowerCase();
      if (!guardianEmail || guardianEmail !== email) return null;
      return {
        rowId: text(row.id),
        organizationId: text(row.organization_id),
        locationId: text(row.location_id),
        legacyId: text(row.legacy_id),
        record,
      };
    })
    .filter((item): item is ParentChildAccess => Boolean(item));

  if (!children.length) {
    throw new Response("This email is not linked to an active TCS family record. Contact your TCS location to verify the guardian email on file.", { status: 403 });
  }

  return { admin, user: userData.user, email, children };
}

export function parentErrorResponse(error: unknown) {
  if (error instanceof Response) return error;
  const message = error instanceof Error ? error.message : "Unexpected Parent Portal error.";
  return Response.json({ error: message }, { status: 500 });
}
