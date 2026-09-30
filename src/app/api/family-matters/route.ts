import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";

type DbRow = Record<string, unknown>;

function object(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DbRow : {};
}
function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
function bool(value: unknown) {
  return value === true;
}
function dateText(value: unknown) {
  const valueText = text(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(valueText) ? valueText : "";
}

async function canManageLocation(
  admin: Awaited<ReturnType<typeof requireStaff>>["admin"],
  organizationId: string,
  userId: string,
  locationId: string,
  isOwner: boolean,
) {
  if (isOwner) return true;
  if (!locationId) return false;
  const { data, error } = await admin
    .from("staff_location_assignments")
    .select("location_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("location_id", locationId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function GET(request: Request) {
  try {
    const { admin, user, profile, isOwner, isLicensee } = await requireStaff(request);
    if (!isOwner && !isLicensee) throw new Response("Family Matters is managed by an Owner/Admin or Location Licensee.", { status: 403 });

    let locationIds: string[] = [];
    if (!isOwner) {
      const assignment = await admin
        .from("staff_location_assignments")
        .select("location_id")
        .eq("organization_id", profile.organization_id)
        .eq("user_id", user.id);
      if (assignment.error) throw assignment.error;
      locationIds = (assignment.data ?? []).map((row) => String(row.location_id));
    }

    const postsResult = await admin
      .from("family_matters_posts")
      .select("id,location_id,category,title,message,emoji,start_date,end_date,is_pinned,is_active,created_at,updated_at")
      .eq("organization_id", profile.organization_id)
      .order("is_pinned", { ascending: false })
      .order("start_date", { ascending: false });
    if (postsResult.error) throw postsResult.error;

    const locationsResult = await admin
      .from("locations")
      .select("id,name,full_name")
      .eq("organization_id", profile.organization_id)
      .eq("is_active", true)
      .order("name");
    if (locationsResult.error) throw locationsResult.error;

    const posts = ((postsResult.data ?? []) as unknown as DbRow[]).filter((row) => {
      const locationId = text(row.location_id);
      return isOwner || !locationId || locationIds.includes(locationId);
    });

    return Response.json({
      canManageAllLocations: isOwner,
      locations: ((locationsResult.data ?? []) as unknown as DbRow[])
        .filter((row) => isOwner || locationIds.includes(text(row.id)))
        .map((row) => ({
          id: text(row.id),
          name: text(row.name) || text(row.full_name),
        })),
      posts: posts.map((row) => ({
        id: text(row.id),
        locationId: text(row.location_id),
        category: text(row.category),
        title: text(row.title),
        message: text(row.message),
        emoji: text(row.emoji),
        startDate: text(row.start_date),
        endDate: text(row.end_date),
        isPinned: bool(row.is_pinned),
        isActive: bool(row.is_active),
        createdAt: text(row.created_at),
        updatedAt: text(row.updated_at),
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { admin, user, profile, isOwner, isLicensee } = await requireStaff(request);
    if (!isOwner && !isLicensee) throw new Response("Family Matters is managed by an Owner/Admin or Location Licensee.", { status: 403 });

    const body = object(await request.json().catch(() => ({})));
    const locationId = text(body.locationId);
    const category = text(body.category);
    const title = text(body.title).slice(0, 160);
    const message = text(body.message).slice(0, 4000);
    const emoji = text(body.emoji).slice(0, 20);
    const startDate = dateText(body.startDate);
    const endDate = dateText(body.endDate);
    const isPinned = bool(body.isPinned);

    if (!title || !message || !startDate) throw new Response("Title, message, and start date are required.", { status: 400 });
    if (!["Reminder","Policy","Thank You","Closure","Schedule Notice","Fun Message"].includes(category)) {
      throw new Response("Choose a valid Family Matters category.", { status: 400 });
    }
    if (!isOwner && !locationId) throw new Response("Location Licensees must choose their assigned location.", { status: 400 });
    if (!(await canManageLocation(admin, profile.organization_id, user.id, locationId, isOwner))) {
      throw new Response("You cannot publish Family Matters posts for that location.", { status: 403 });
    }

    const saved = await admin
      .from("family_matters_posts")
      .insert({
        organization_id: profile.organization_id,
        location_id: locationId || null,
        category,
        title,
        message,
        emoji: emoji || null,
        start_date: startDate,
        end_date: endDate || null,
        is_pinned: isPinned,
        is_active: true,
        created_by: user.id,
        updated_by: user.id,
      })
      .select("id")
      .single();
    if (saved.error) throw saved.error;

    return Response.json({ ok: true, id: saved.data.id, message: "Family Matters post scheduled." });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { admin, user, profile, isOwner, isLicensee } = await requireStaff(request);
    if (!isOwner && !isLicensee) throw new Response("Family Matters is managed by an Owner/Admin or Location Licensee.", { status: 403 });

    const body = object(await request.json().catch(() => ({})));
    const id = text(body.id);
    if (!id) throw new Response("Choose a Family Matters post.", { status: 400 });

    const existing = await admin
      .from("family_matters_posts")
      .select("id,location_id")
      .eq("organization_id", profile.organization_id)
      .eq("id", id)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data) throw new Response("That Family Matters post was not found.", { status: 404 });

    if (!(await canManageLocation(admin, profile.organization_id, user.id, text(existing.data.location_id), isOwner))) {
      throw new Response("You cannot change that Family Matters post.", { status: 403 });
    }

    const update: DbRow = { updated_by: user.id };
    if ("isActive" in body) update.is_active = bool(body.isActive);
    if ("isPinned" in body) update.is_pinned = bool(body.isPinned);
    if (text(body.title)) update.title = text(body.title).slice(0, 160);
    if (text(body.message)) update.message = text(body.message).slice(0, 4000);
    if (text(body.category)) update.category = text(body.category);
    if ("startDate" in body) update.start_date = dateText(body.startDate);
    if ("endDate" in body) update.end_date = dateText(body.endDate) || null;
    if ("emoji" in body) update.emoji = text(body.emoji).slice(0, 20) || null;

    const saved = await admin.from("family_matters_posts").update(update).eq("id", id);
    if (saved.error) throw saved.error;
    return Response.json({ ok: true, message: "Family Matters post updated." });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { admin, user, profile, isOwner, isLicensee } = await requireStaff(request);
    if (!isOwner && !isLicensee) throw new Response("Family Matters is managed by an Owner/Admin or Location Licensee.", { status: 403 });
    const body = object(await request.json().catch(() => ({})));
    const id = text(body.id);
    if (!id) throw new Response("Choose a Family Matters post.", { status: 400 });

    const existing = await admin
      .from("family_matters_posts")
      .select("id,location_id")
      .eq("organization_id", profile.organization_id)
      .eq("id", id)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data) throw new Response("That Family Matters post was not found.", { status: 404 });
    if (!(await canManageLocation(admin, profile.organization_id, user.id, text(existing.data.location_id), isOwner))) {
      throw new Response("You cannot delete that Family Matters post.", { status: 403 });
    }

    const removed = await admin.from("family_matters_posts").delete().eq("id", id);
    if (removed.error) throw removed.error;
    return Response.json({ ok: true, message: "Family Matters post removed." });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
