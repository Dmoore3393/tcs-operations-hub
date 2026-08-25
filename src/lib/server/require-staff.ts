import "server-only";

import { isLicenseeAccessRole, isOwnerAccessRole } from "@/lib/team-access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export type AuthorizedStaff = {
  admin: SupabaseClient;
  userClient: SupabaseClient;
  user: User;
  token: string;
  profile: {
    user_id: string;
    organization_id: string;
    email: string;
    full_name: string;
    role: string;
    is_active: boolean;
    permissions: string[];
  };
  isOwner: boolean;
  isLicensee: boolean;
};

export async function requireStaff(request: Request): Promise<AuthorizedStaff> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) throw new Response("Missing staff session.", { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) throw new Response("The staff session is invalid or expired.", { status: 401 });

  const { data: profile, error: profileError } = await admin
    .from("staff_access")
    .select("user_id,organization_id,email,full_name,role,is_active,permissions")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile || !profile.is_active) {
    throw new Response("Active TCS staff access is required.", { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !publishable) throw new Error("Missing Supabase public server configuration.");

  const userClient = createClient(url, publishable, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  return {
    admin,
    userClient,
    user: userData.user,
    token,
    profile,
    isOwner: isOwnerAccessRole(profile.role),
    isLicensee: isLicenseeAccessRole(profile.role),
  };
}

export function staffErrorResponse(error: unknown) {
  if (error instanceof Response) return error;
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  return Response.json({ error: message }, { status: 500 });
}
