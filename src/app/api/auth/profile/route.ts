import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupportedAccessRole } from "@/lib/team-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StaffAccessRow = {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  locations: string[];
  permissions: string[];
  is_active: boolean;
  organization_id: string;
  invited_at: string | null;
  accepted_at: string | null;
};

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

async function loadProfile(admin: ReturnType<typeof createSupabaseAdminClient>, userId: string) {
  return admin
    .from("staff_access")
    .select("user_id,email,full_name,role,locations,permissions,is_active,organization_id,invited_at,accepted_at")
    .eq("user_id", userId)
    .maybeSingle();
}

export async function GET(request: Request) {
  const token = bearerToken(request);
  if (!token) return Response.json({ error: "Missing staff session." }, { status: 401 });

  try {
    const admin = createSupabaseAdminClient();
    const { data: userData, error: userError } = await admin.auth.getUser(token);

    if (userError || !userData.user) {
      return Response.json({ error: "The staff session is invalid or expired." }, { status: 401 });
    }

    const user = userData.user;
    let profileResult = await loadProfile(admin, user.id);
    if (profileResult.error) throw profileResult.error;

    let bootstrapped = false;

    if (!profileResult.data) {
      const { count, error: countError } = await admin
        .from("staff_access")
        .select("user_id", { count: "exact", head: true });

      if (countError) throw countError;

      // Safe one-time recovery for the original setup case:
      // only bootstrap when no staff records exist and this is the only Auth user.
      if ((count ?? 0) === 0) {
        const { data: usersPage, error: usersError } = await admin.auth.admin.listUsers({
          page: 1,
          perPage: 2,
        });
        if (usersError) throw usersError;

        const users = usersPage.users ?? [];
        if (users.length === 1 && users[0]?.id === user.id) {
          const email = user.email?.trim().toLowerCase() ?? "";
          if (!email) {
            return Response.json({ error: "This account does not have a verified email address." }, { status: 403 });
          }

          const now = new Date().toISOString();
          const fullName =
            (typeof user.user_metadata?.tcs_full_name === "string" && user.user_metadata.tcs_full_name.trim()) ||
            (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()) ||
            "Danielle Moore";

          const { error: insertError } = await admin.from("staff_access").insert({
            user_id: user.id,
            email,
            full_name: fullName,
            role: "Owner / Admin",
            locations: ["All Locations"],
            permissions: [],
            is_active: true,
            invited_at: now,
            accepted_at: now,
          });
          if (insertError) throw insertError;

          await admin.auth.admin.updateUserById(user.id, {
            user_metadata: {
              ...user.user_metadata,
              tcs_full_name: fullName,
              tcs_role: "Owner / Admin",
              tcs_locations: ["All Locations"],
              tcs_permissions: [],
            },
          });

          bootstrapped = true;
          profileResult = await loadProfile(admin, user.id);
          if (profileResult.error) throw profileResult.error;
        }
      }
    }

    const profile = profileResult.data as StaffAccessRow | null;

    if (!profile) {
      return Response.json(
        {
          error:
            "This login is valid, but it is not linked to an active TCS staff record. Owner setup needs to be repaired in Supabase.",
        },
        { status: 403 },
      );
    }

    if (!profile.is_active) {
      return Response.json({ error: "This TCS staff account is paused." }, { status: 403 });
    }

    if (!isSupportedAccessRole(profile.role)) {
      return Response.json(
        { error: "This account has an unsupported Hub access role." },
        { status: 403 },
      );
    }

    const laneResult = await admin
      .from("staff_lane_profiles")
      .select("id,job_title,secondary_title,lane_level,lane_group,reports_to_label")
      .eq("organization_id", profile.organization_id)
      .eq("staff_user_id", profile.user_id)
      .eq("is_active", true)
      .maybeSingle();

    if (laneResult.error) throw laneResult.error;

    return Response.json({
      bootstrapped,
      profile: {
        ...profile,
        locations: Array.isArray(profile.locations) ? profile.locations : [],
        permissions: Array.isArray(profile.permissions) ? profile.permissions : [],
        lane_profile_id: laneResult.data?.id ?? null,
        job_title: laneResult.data?.job_title ?? null,
        secondary_title: laneResult.data?.secondary_title ?? null,
        lane_level: laneResult.data?.lane_level ?? null,
        lane_group: laneResult.data?.lane_group ?? null,
        reports_to_label: laneResult.data?.reports_to_label ?? null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not verify staff access.";
    return Response.json({ error: message }, { status: 500 });
  }
}
