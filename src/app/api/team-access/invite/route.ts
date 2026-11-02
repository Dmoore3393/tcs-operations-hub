import {recommendedStaffInviteRole} from "@/lib/staff-invite-access";
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

export async function GET(request:Request) {
  try {
    const {admin,profile}=await requireOwner(request);
    const laneId=new URL(request.url).searchParams.get("lane") || "";
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(laneId))return Response.json({error:"Choose an existing employee profile."},{status:400});
    const lane=await admin.from("staff_lane_profiles").select("id,full_name,job_title,lane_level,lane_group,department,primary_location,staff_user_id").eq("organization_id",profile.organization_id).eq("id",laneId).eq("is_active",true).maybeSingle();
    if(lane.error)throw lane.error;
    if(!lane.data)return Response.json({error:"The active employee profile was not found."},{status:404});
    if(lane.data.staff_user_id)return Response.json({error:"This employee already has a linked Hub account. Use Manage Access to review it or send a new setup link."},{status:409});
    const contacts=await admin.from("staff_personnel_imports").select("details").eq("organization_id",profile.organization_id).eq("lane_id",lane.data.id);
    if(contacts.error)throw contacts.error;
    const emails=[...new Set((contacts.data || []).map(row=>{const value=row.details?.Email;return typeof value==="string" ? value.trim().toLowerCase() : "";}).filter(value=>/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(value)))];
    return Response.json({recommendedRole:recommendedStaffInviteRole(lane.data),employee:lane.data,email:emails.length===1?emails[0]:"",emailNeedsReview:emails.length>1},{headers:{"Cache-Control":"private, no-store","Vary":"Authorization"}});
  }catch(error){return responseFromThrown(error);}
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

    if (email.length>254 || !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email)) {
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    let locations:string[];
    try{locations = locationsForRole(role, body.locations);}catch(error){return Response.json({error:error instanceof Error?error.message:"Choose valid locations."},{status:400});}
    let permissions = role === "Employee" ? sanitizeEmployeePermissions(body.permissions) : [];
    const requestedLaneId = body.lane_profile_id?.trim() || null;

    let selectedLane: { id: string; full_name:string; updated_at:string; department:string|null; staff_user_id: string | null; job_title: string; secondary_title: string | null } | null = null;
    if (requestedLaneId) {
      const laneResult = await admin
        .from("staff_lane_profiles")
        .select("id,full_name,updated_at,department,staff_user_id,job_title,lane_level,lane_group,secondary_title")
        .eq("organization_id", profile.organization_id)
        .eq("id", requestedLaneId)
        .eq("is_active", true)
        .maybeSingle();
      if (laneResult.error) throw laneResult.error;
      if (!laneResult.data) return Response.json({ error: "The selected TCS lane was not found." }, { status: 400 });
      if (laneResult.data.staff_user_id) return Response.json({ error: "That TCS lane is already linked to another Hub account." }, { status: 409 });
      if(laneResult.data.full_name !== fullName)return Response.json({error:"Use the existing employee’s name. Invitations do not rename staff profiles."},{status:400});
      if(recommendedStaffInviteRole(laneResult.data)==="Owner / Admin"&&role!=="Owner / Admin")return Response.json({error:"This existing owner profile must be invited with Owner/Admin access."},{status:400});
      selectedLane = laneResult.data;
      if(role==="Employee" && laneResult.data.department?.toLowerCase()==="maintenance")permissions=[permissions.includes("maintenance_manage")?"maintenance_manage":"maintenance_view",...(permissions.includes("transportation")?["transportation" as const]:[])];
    }

    const { data: existing, error:existingError } = await admin
      .from("staff_access")
      .select("user_id,email")
      .eq("organization_id", profile.organization_id)
      .ilike("email", email)
      .maybeSingle();

    if(existingError)throw existingError;
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
        .update({ staff_user_id: invitedUser.id })
        .eq("organization_id", profile.organization_id)
        .eq("id", selectedLane.id)
        .is("staff_user_id",null).eq("is_active",true).eq("updated_at",selectedLane.updated_at).select("id").maybeSingle();
      if (laneLink.error || !laneLink.data) {
        await admin.from("staff_access").delete().eq("user_id", invitedUser.id);
        await admin.auth.admin.deleteUser(invitedUser.id).catch(() => undefined);
        if(laneLink.error)throw laneLink.error;
        return Response.json({error:"This employee profile changed or was already linked. Refresh Employees before trying again."},{status:409});
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
