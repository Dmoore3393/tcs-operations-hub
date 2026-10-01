import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";

export const runtime = "nodejs";

const BUCKET = "weekly-menu-images";
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeFileName(value: string) {
  const clean = value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return clean.slice(-120) || "weekly-menu";
}

async function accessibleLocationIds(auth: Awaited<ReturnType<typeof requireStaff>>) {
  if (auth.isOwner) {
    const result = await auth.admin
      .from("locations")
      .select("id")
      .eq("organization_id", auth.profile.organization_id)
      .eq("is_active", true);
    if (result.error) throw result.error;
    return (result.data ?? []).map((row) => String(row.id));
  }

  const result = await auth.admin
    .from("staff_location_assignments")
    .select("location_id")
    .eq("organization_id", auth.profile.organization_id)
    .eq("user_id", auth.user.id);
  if (result.error) throw result.error;
  return [...new Set((result.data ?? []).map((row) => String(row.location_id)))];
}

function canReadMeals(auth: Awaited<ReturnType<typeof requireStaff>>) {
  return auth.isOwner || auth.isLicensee || auth.profile.permissions.includes("meals") || auth.profile.permissions.includes("daily_care");
}

function canManageMeals(auth: Awaited<ReturnType<typeof requireStaff>>) {
  return auth.isOwner || auth.isLicensee || auth.profile.permissions.includes("meals");
}

async function resolveLocation(auth: Awaited<ReturnType<typeof requireStaff>>, locationName: string) {
  const result = await auth.admin
    .from("locations")
    .select("id,name,full_name,slug")
    .eq("organization_id", auth.profile.organization_id)
    .eq("is_active", true);
  if (result.error) throw result.error;

  const normalized = locationName.trim().toLowerCase();
  const location = (result.data ?? []).find((row) =>
    [row.name, row.full_name, row.slug].filter(Boolean).some((value) => String(value).trim().toLowerCase() === normalized),
  );
  if (!location) throw new Response("That childcare location was not found.", { status: 404 });

  const allowed = await accessibleLocationIds(auth);
  if (!allowed.includes(String(location.id))) throw new Response("You do not have access to that location.", { status: 403 });

  return location;
}

export async function GET(request: Request) {
  try {
    const auth = await requireStaff(request);
    if (!canReadMeals(auth)) throw new Response("Meals access is required.", { status: 403 });

    const url = new URL(request.url);
    const path = text(url.searchParams.get("path"));
    const locationName = text(url.searchParams.get("location"));
    if (!path || !locationName) throw new Response("Menu image path and location are required.", { status: 400 });

    const location = await resolveLocation(auth, locationName);

    const menu = await auth.admin
      .from("weekly_menus")
      .select("id,location_id,record_data")
      .eq("organization_id", auth.profile.organization_id)
      .eq("location_id", location.id)
      .contains("record_data", { menuImagePath: path })
      .maybeSingle();
    if (menu.error) throw menu.error;
    if (!menu.data) throw new Response("That menu image is not attached to this location.", { status: 404 });

    const signed = await auth.admin.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
    if (signed.error) throw signed.error;
    return Response.json({ url: signed.data.signedUrl }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireStaff(request);
    if (!canManageMeals(auth)) throw new Response("Menu editing permission is required.", { status: 403 });

    const form = await request.formData();
    const locationName = text(form.get("location"));
    const weekOf = text(form.get("weekOf")).slice(0, 10);
    const file = form.get("file");

    if (!locationName || !/^\d{4}-\d{2}-\d{2}$/.test(weekOf)) {
      throw new Response("Location and menu week are required.", { status: 400 });
    }
    if (!(file instanceof File)) throw new Response("Choose a menu image.", { status: 400 });
    if (!ALLOWED_MIME.has(file.type)) throw new Response("Use a JPG, PNG, or WebP menu image.", { status: 415 });
    if (file.size <= 0 || file.size > MAX_BYTES) throw new Response("Menu images must be 10 MB or smaller.", { status: 413 });

    const location = await resolveLocation(auth, locationName);
    const path = `${auth.profile.organization_id}/${location.id}/${weekOf}/${Date.now()}-${safeFileName(file.name)}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const upload = await auth.admin.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type,
      upsert: false,
      cacheControl: "3600",
    });
    if (upload.error) throw upload.error;

    const signed = await auth.admin.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
    if (signed.error) {
      await auth.admin.storage.from(BUCKET).remove([path]);
      throw signed.error;
    }

    return Response.json({
      ok: true,
      path,
      name: file.name,
      uploadedAt: new Date().toISOString(),
      url: signed.data.signedUrl,
      message: "Weekly menu image uploaded.",
    });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireStaff(request);
    if (!canManageMeals(auth)) throw new Response("Menu editing permission is required.", { status: 403 });

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const path = text(body.path);
    const locationName = text(body.location);
    if (!path || !locationName) throw new Response("Menu image path and location are required.", { status: 400 });

    await resolveLocation(auth, locationName);

    const requiredPrefix = `${auth.profile.organization_id}/`;
    if (!path.startsWith(requiredPrefix)) throw new Response("That menu image does not belong to this TCS organization.", { status: 403 });

    const removed = await auth.admin.storage.from(BUCKET).remove([path]);
    if (removed.error) throw removed.error;
    return Response.json({ ok: true, message: "Weekly menu image removed." });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
