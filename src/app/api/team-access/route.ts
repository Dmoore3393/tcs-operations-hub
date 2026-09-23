import { careLocations } from "@/lib/location-config";
import {
  ACCESS_ROLES,
  canonicalAccessRole,
  sanitizeEmployeePermissions,
  type AccessRole,
  type TeamAccessAccount,
} from "@/lib/team-access";
import { requireOwner, responseFromThrown } from "@/lib/server/require-owner";

export const runtime = "nodejs";

type UpdateBody = {
  user_id?: string;
  full_name?: string;
  role?: AccessRole;
  locations?: string[];
  permissions?: string[];
  is_active?: boolean;
  lane_profile_id?: string | null;
};

function normalizeLocations(role: AccessRole, values: string[] | undefined) {
  if (role === "Owner / Admin") return ["All Locations"];

  const unique = [...new Set((values ?? []).filter((location) => careLocations.includes(location as (typeof careLocations)[number])))];
  if (role === "Location Licensee") {
    if (unique.length !== 1) throw new Error("A Licensee must be assigned exactly one location.");
    return unique;
  }

  if (!unique.length) throw new Error("An Employee must be assigned at least one location.");
  return unique;
}

export async function GET(request: Request) {
  try {
    const { admin, profile } = await requireOwner(request);
    const [{ data: staff, error: staffError }, { data: lanes, error: lanesError }] = await Promise.all([
      admin
      .from("staff_access")
      .select("user_id,email,full_name,role,locations,permissions,is_active,organization_id,invited_at,accepted_at,created_at")
      .eq("organization_id", profile.organization_id)
      .order("full_name"),
      admin
        .from("staff_lane_profiles")
        .select("id,staff_user_id,full_name,preferred_name,lane_level,lane_group,job_title,secondary_title,reports_to_label,primary_location,sort_order,is_active")
        .eq("organization_id", profile.organization_id)
        .eq("is_active", true)
        .order("sort_order")
        .order("full_name"),
    ]);

    if (staffError) throw staffError;
    if (lanesError) throw lanesError;

    const authUsers = new Map<string, { last_sign_in_at: string | null; created_at: string | null }>();
    let page = 1;
    while (page <= 10) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
      if (error) throw error;
      for (const user of data.users) {
        authUsers.set(user.id, {
          last_sign_in_at: user.last_sign_in_at ?? null,
          created_at: user.created_at ?? null,
        });
      }
      if (data.users.length < 100) break;
      page += 1;
    }

    const laneMap = new Map((lanes ?? []).filter((lane) => lane.staff_user_id).map((lane) => [String(lane.staff_user_id), lane]));

    const accounts: TeamAccessAccount[] = (staff ?? []).map((row) => {
      const auth = authUsers.get(row.user_id);
      const lane = laneMap.get(String(row.user_id));
      const isActive = Boolean(row.is_active);
      const accepted = Boolean(row.accepted_at);
      return {
        user_id: row.user_id,
        email: row.email,
        full_name: row.full_name,
        role: canonicalAccessRole(row.role),
        lane_profile_id: lane?.id ?? null,
        job_title: lane?.job_title ?? null,
        secondary_title: lane?.secondary_title ?? null,
        lane_level: lane?.lane_level ?? null,
        lane_group: lane?.lane_group ?? null,
        reports_to_label: lane?.reports_to_label ?? null,
        locations: Array.isArray(row.locations) ? row.locations : [],
        permissions: Array.isArray(row.permissions) ? row.permissions : [],
        is_active: isActive,
        organization_id: row.organization_id,
        invited_at: row.invited_at ?? null,
        accepted_at: row.accepted_at ?? null,
        last_sign_in_at: auth?.last_sign_in_at ?? null,
        created_at: auth?.created_at ?? row.created_at ?? null,
        status: !isActive ? "Paused" : accepted ? "Active" : "Invite Pending",
      };
    });

    return Response.json({ accounts, lanes: lanes ?? [] });
  } catch (error) {
    return responseFromThrown(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { admin, user, profile } = await requireOwner(request);
    const body = (await request.json()) as UpdateBody;
    const userId = body.user_id?.trim();
    const fullName = body.full_name?.trim();
    const role = body.role;

    if (!userId || !fullName || !role || !ACCESS_ROLES.includes(role)) {
      return Response.json({ error: "Name, role, and account ID are required." }, { status: 400 });
    }

    const { data: target, error: targetError } = await admin
      .from("staff_access")
      .select("user_id,role,is_active,organization_id")
      .eq("user_id", userId)
      .eq("organization_id", profile.organization_id)
      .maybeSingle();

    if (targetError) throw targetError;
    if (!target) return Response.json({ error: "Staff account not found." }, { status: 404 });

    const nextActive = body.is_active !== false;
    const removingOwner = canonicalAccessRole(target.role) === "Owner / Admin" && (role !== "Owner / Admin" || !nextActive);
    if (removingOwner) {
      const { count, error: countError } = await admin
        .from("staff_access")
        .select("user_id", { count: "exact", head: true })
        .eq("organization_id", profile.organization_id)
        .eq("is_active", true)
        .in("role", ["Owner / Admin", "Owner / Director", "Administrator", "Admin", "Director", "Corporate / Admin"]);
      if (countError) throw countError;
      if ((count ?? 0) <= 1) {
        return Response.json({ error: "The Hub must always have at least one active Owner/Admin." }, { status: 409 });
      }
    }

    const locations = normalizeLocations(role, body.locations);
    const permissions = role === "Employee" ? sanitizeEmployeePermissions(body.permissions) : [];
    const laneProfileId = body.lane_profile_id?.trim() || null;

    if (laneProfileId) {
      const { data: lane, error: laneError } = await admin
        .from("staff_lane_profiles")
        .select("id,staff_user_id")
        .eq("organization_id", profile.organization_id)
        .eq("id", laneProfileId)
        .eq("is_active", true)
        .maybeSingle();
      if (laneError) throw laneError;
      if (!lane) return Response.json({ error: "The selected TCS lane was not found." }, { status: 400 });
      if (lane.staff_user_id && String(lane.staff_user_id) !== userId) {
        return Response.json({ error: "That TCS lane is already linked to another Hub account." }, { status: 409 });
      }
    }

    const { error: updateError } = await admin
      .from("staff_access")
      .update({
        full_name: fullName,
        role,
        locations,
        permissions,
        is_active: nextActive,
      })
      .eq("user_id", userId)
      .eq("organization_id", profile.organization_id);

    if (updateError) throw updateError;

    if (Object.prototype.hasOwnProperty.call(body, "lane_profile_id")) {
      const unlink = await admin
        .from("staff_lane_profiles")
        .update({ staff_user_id: null })
        .eq("organization_id", profile.organization_id)
        .eq("staff_user_id", userId)
        .neq("id", laneProfileId || "00000000-0000-0000-0000-000000000000");
      if (unlink.error) throw unlink.error;

      if (laneProfileId) {
        const link = await admin
          .from("staff_lane_profiles")
          .update({ staff_user_id: userId, full_name: fullName })
          .eq("organization_id", profile.organization_id)
          .eq("id", laneProfileId);
        if (link.error) throw link.error;
      }
    }

    await admin.auth.admin.updateUserById(userId, {
      user_metadata: {
        tcs_full_name: fullName,
        tcs_role: role,
        tcs_locations: locations,
        tcs_permissions: permissions,
      },
    });

    return Response.json({ ok: true, selfUpdated: userId === user.id });
  } catch (error) {
    return responseFromThrown(error);
  }
}
