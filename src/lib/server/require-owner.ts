import "server-only";

import { isOwnerAccessRole } from "@/lib/team-access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { User } from "@supabase/supabase-js";

export type AuthorizedOwner = {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  user: User;
  profile: {
    user_id: string;
    organization_id: string;
    email: string;
    full_name: string;
    role: string;
    is_active: boolean;
  };
};

export async function requireOwner(request: Request): Promise<AuthorizedOwner> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";

  if (!token) throw new Response("Missing staff session.", { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(token);

  if (userError || !userData.user) {
    throw new Response("The staff session is invalid or expired.", { status: 401 });
  }

  const { data: profile, error: profileError } = await admin
    .from("staff_access")
    .select("user_id,organization_id,email,full_name,role,is_active")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile || !profile.is_active || !isOwnerAccessRole(profile.role)) {
    throw new Response("Owner/Admin access is required.", { status: 403 });
  }

  return { admin, user: userData.user, profile };
}

export function responseFromThrown(error: unknown) {
  if (error instanceof Response) return error;
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  return Response.json({ error: message }, { status: 500 });
}
