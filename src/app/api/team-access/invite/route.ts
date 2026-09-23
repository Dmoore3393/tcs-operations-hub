import { careLocations } from "@/lib/location-config";
import {
  ACCESS_ROLES,
  sanitizeEmployeePermissions,
  type AccessRole,
} from "@/lib/team-access";
import { requireOwner, responseFromThrown } from "@/lib/server/require-owner";

export const runtime = "nodejs";

type InviteBody = {
  full_name?: string;
  email?: string;
  role?: AccessRole;
  locations?: string[];
  permissions?: string[];
  lane_profile_id?: string | null;
};

function locationsForRole(role: AccessRole, values: string[] | undefined) {
  if (role === "Owner / Admin") return ["All Locations"];
  const unique = [...new Set((values ?? []).filter((location) => careLocations.includes(location as (typeof careLocations)[number])))];
  if (role === "Location Licensee" && unique.length !== 1) throw new Error("Choose exactly one location for the Licensee.");
  if (role === "Employee" && unique.length < 1) throw new Error("Choose at least one location for the Employee.");
  return unique;
}

export async function POST(request: Request) {
  try {
    const { admin, user, profile } = await requireOwner(request);
    const body = (await request.json()) as InviteBody;
    const fullName = body.full_name?.trim() ?? "";
    const email = body.email?.trim().toLowerCase() ?? "";
    const role = body.role;

    if (!fullName || !email || !role || !ACCESS_ROLES.includes(role)) {
      return Response.json({ error: "Enter the person’s name, email, and role." }, { status: 400 });
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const locations = locationsForRole(role, body.locations);
    const permissions = role === "Employee" ? sanitizeEmployeePermissions(body.permissions) : [];
    const requestedLaneId = body.lane_profile_id?.trim() || null;

    let selectedLane: { id: string; staff_user_id: string | null; job_title: string; secondary_title: string | null } | null = null;
    if (requestedLaneId) {
      const laneResult = await admin
        .from("staff_lane_profiles")
        .select("id,staff_user_id,job_title,secondary_title")
        .eq("organization_id", profile.organization_id)
        .eq("id", requestedLaneId)
        .eq("is_active", true)
        .maybeSingle();
      if (laneResult.error) throw laneResult.error;
      if (!laneResult.data) return Response.json({ error: "The selected TCS lane was not found." }, { status: 400 });
      if (laneResult.data.staff_user_id) return Response.json({ error: "That TCS lane is already linked to another Hub account." }, { status: 409 });
      selectedLane = laneResult.data;
    }

    const { data: existing } = await admin
      .from("staff_access")
      .select("user_id,email")
      .eq("organization_id", profile.organization_id)
      .ilike("email", email)
      .maybeSingle();

    if (existing) {
      return Response.json({ error: "That email already has a TCS account. Edit the existing account or send a new setup link." }, { status: 409 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || new URL(request.url).origin;
    const redirectTo = `${siteUrl}/accept-invite`;
    const invitedAt = new Date().toISOString();

    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: {
        tcs_full_name: fullName,
        tcs_role: role,
        tcs_locations: locations,
        tcs_permissions: permissions,
        tcs_organization_id: profile.organization_id,
        tcs_invited_by: user.id,
      },
      redirectTo,
    });

    if (inviteError || !inviteData.user) {
      return Response.json({ error: inviteError?.message ?? "Supabase did not create the invitation." }, { status: 400 });
    }

    const invitedUser = inviteData.user;
    const { error: accessError } = await admin.from("staff_access").upsert({
      user_id: invitedUser.id,
      organization_id: profile.organization_id,
      email,
      full_name: fullName,
      role,
      locations,
      permissions,
      is_active: true,
      invited_by: user.id,
      invited_at: invitedAt,
      accepted_at: null,
    }, { onConflict: "user_id" });

    if (accessError) {
      await admin.auth.admin.deleteUser(invitedUser.id).catch(() => undefined);
      throw accessError;
    }

    if (selectedLane) {
      const laneLink = await admin
        .from("staff_lane_profiles")
        .update({ staff_user_id: invitedUser.id, full_name: fullName })
        .eq("organization_id", profile.organization_id)
        .eq("id", selectedLane.id);
      if (laneLink.error) {
        await admin.from("staff_access").delete().eq("user_id", invitedUser.id);
        await admin.auth.admin.deleteUser(invitedUser.id).catch(() => undefined);
        throw laneLink.error;
      }
    }

    const { error: invitationError } = await admin.from("staff_invitations").upsert({
      organization_id: profile.organization_id,
      auth_user_id: invitedUser.id,
      email,
      full_name: fullName,
      role,
      locations,
      permissions,
      status: "pending",
      invited_by: user.id,
      invited_at: invitedAt,
      accepted_at: null,
    }, { onConflict: "organization_id,email" });

    if (invitationError) throw invitationError;

    return Response.json({
      ok: true,
      invitation: {
        user_id: invitedUser.id,
        email,
        full_name: fullName,
        role,
        locations,
        permissions,
        lane_profile_id: selectedLane?.id ?? null,
        job_title: selectedLane?.job_title ?? null,
        secondary_title: selectedLane?.secondary_title ?? null,
        invited_at: invitedAt,
      },
    });
  } catch (error) {
    return responseFromThrown(error);
  }
}
