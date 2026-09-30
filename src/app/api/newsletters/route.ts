import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";

export const runtime = "nodejs";

const BUCKET = "family-newsletters";
const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

type DbRow = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function monthStart(value: unknown) {
  const raw = text(value);
  const match = raw.match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-01` : "";
}

function safeFileName(value: string) {
  const clean = value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return clean.slice(-120) || "newsletter";
}

async function accessibleLocationIds(auth: Awaited<ReturnType<typeof requireStaff>>) {
  if (auth.isOwner) {
    const result = await auth.admin.from("locations").select("id").eq("organization_id", auth.profile.organization_id).eq("is_active", true);
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

async function signedUrl(auth: Awaited<ReturnType<typeof requireStaff>>, objectPath: string) {
  const result = await auth.admin.storage.from(BUCKET).createSignedUrl(objectPath, 60 * 60);
  return result.error ? "" : result.data.signedUrl;
}

export async function GET(request: Request) {
  try {
    const auth = await requireStaff(request);
    if (!auth.isOwner && !auth.isLicensee) throw new Response("Newsletter management is limited to TCS leadership.", { status: 403 });

    const locationIds = await accessibleLocationIds(auth);
    const [locationResult, newsletterResult] = await Promise.all([
      auth.admin
        .from("locations")
        .select("id,name,full_name")
        .eq("organization_id", auth.profile.organization_id)
        .eq("is_active", true)
        .order("name"),
      auth.admin
        .from("family_newsletters")
        .select("id,location_id,newsletter_month,title,summary,object_path,mime_type,size_bytes,is_published,created_by_name,created_at,updated_at")
        .eq("organization_id", auth.profile.organization_id)
        .order("newsletter_month", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);
    if (locationResult.error) throw locationResult.error;
    if (newsletterResult.error) throw newsletterResult.error;

    const visibleRows = ((newsletterResult.data ?? []) as unknown as DbRow[]).filter((row) => {
      const locationId = text(row.location_id);
      return auth.isOwner || !locationId || locationIds.includes(locationId);
    });

    return Response.json({
      canManageAllLocations: auth.isOwner,
      locations: (locationResult.data ?? [])
        .filter((row) => auth.isOwner || locationIds.includes(String(row.id)))
        .map((row) => ({ id: String(row.id), name: row.name || row.full_name })),
      newsletters: await Promise.all(visibleRows.map(async (row) => ({
        id: text(row.id),
        locationId: text(row.location_id),
        month: text(row.newsletter_month),
        title: text(row.title),
        summary: text(row.summary),
        mimeType: text(row.mime_type),
        sizeBytes: Number(row.size_bytes) || 0,
        isPublished: row.is_published === true,
        createdByName: text(row.created_by_name),
        createdAt: text(row.created_at),
        updatedAt: text(row.updated_at),
        url: await signedUrl(auth, text(row.object_path)),
      }))),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireStaff(request);
    if (!auth.isOwner && !auth.isLicensee) throw new Response("Newsletter management is limited to TCS leadership.", { status: 403 });

    const form = await request.formData();
    const locationId = text(form.get("locationId"));
    const month = monthStart(form.get("month"));
    const title = text(form.get("title")).slice(0, 180);
    const summary = text(form.get("summary")).slice(0, 1200);
    const file = form.get("file");

    if (!month || !title) throw new Response("Newsletter month and title are required.", { status: 400 });
    if (!(file instanceof File)) throw new Response("Choose a newsletter file.", { status: 400 });
    if (!ALLOWED_MIME.has(file.type)) throw new Response("Use a PDF, JPG, PNG, or WebP newsletter file.", { status: 415 });
    if (file.size <= 0 || file.size > MAX_BYTES) throw new Response("Newsletter files must be 15 MB or smaller.", { status: 413 });

    const allowed = await accessibleLocationIds(auth);
    if (!auth.isOwner && !locationId) throw new Response("Location Licensees must choose their assigned location.", { status: 400 });
    if (locationId && !allowed.includes(locationId)) throw new Response("You do not have access to that location.", { status: 403 });

    const path = `${auth.profile.organization_id}/${locationId || "all-locations"}/${month.slice(0,7)}/${Date.now()}-${safeFileName(file.name)}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const upload = await auth.admin.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type,
      upsert: false,
      cacheControl: "3600",
    });
    if (upload.error) throw upload.error;

    try {
      const saved = await auth.admin
        .from("family_newsletters")
        .insert({
          organization_id: auth.profile.organization_id,
          location_id: locationId || null,
          newsletter_month: month,
          title,
          summary: summary || null,
          object_path: path,
          mime_type: file.type,
          size_bytes: file.size,
          is_published: true,
          created_by: auth.user.id,
          created_by_name: auth.profile.full_name || auth.profile.email,
        })
        .select("id")
        .single();
      if (saved.error) throw saved.error;

      return Response.json({ ok: true, id: saved.data.id, message: "Monthly newsletter published to the Family Portal." });
    } catch (error) {
      await auth.admin.storage.from(BUCKET).remove([path]);
      throw error;
    }
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireStaff(request);
    if (!auth.isOwner && !auth.isLicensee) throw new Response("Newsletter management is limited to TCS leadership.", { status: 403 });
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const id = text(body.id);
    if (!id) throw new Response("Choose a newsletter.", { status: 400 });

    const existing = await auth.admin
      .from("family_newsletters")
      .select("id,location_id")
      .eq("organization_id", auth.profile.organization_id)
      .eq("id", id)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data) throw new Response("That newsletter was not found.", { status: 404 });

    const allowed = await accessibleLocationIds(auth);
    if (!auth.isOwner && existing.data.location_id && !allowed.includes(String(existing.data.location_id))) {
      throw new Response("You do not have access to that newsletter.", { status: 403 });
    }

    const updates: Record<string, unknown> = {};
    if ("isPublished" in body) updates.is_published = body.isPublished === true;
    if (text(body.title)) updates.title = text(body.title).slice(0, 180);
    if ("summary" in body) updates.summary = text(body.summary).slice(0, 1200) || null;
    if (!Object.keys(updates).length) throw new Response("No newsletter changes were provided.", { status: 400 });

    const saved = await auth.admin.from("family_newsletters").update(updates).eq("id", id);
    if (saved.error) throw saved.error;
    return Response.json({ ok: true, message: "Newsletter updated." });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireStaff(request);
    if (!auth.isOwner && !auth.isLicensee) throw new Response("Newsletter management is limited to TCS leadership.", { status: 403 });
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const id = text(body.id);
    if (!id) throw new Response("Choose a newsletter.", { status: 400 });

    const existing = await auth.admin
      .from("family_newsletters")
      .select("id,location_id,object_path")
      .eq("organization_id", auth.profile.organization_id)
      .eq("id", id)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data) throw new Response("That newsletter was not found.", { status: 404 });

    const allowed = await accessibleLocationIds(auth);
    if (!auth.isOwner && existing.data.location_id && !allowed.includes(String(existing.data.location_id))) {
      throw new Response("You do not have access to that newsletter.", { status: 403 });
    }

    const removeFile = await auth.admin.storage.from(BUCKET).remove([existing.data.object_path]);
    if (removeFile.error) throw removeFile.error;
    const removeRow = await auth.admin.from("family_newsletters").delete().eq("id", id);
    if (removeRow.error) throw removeRow.error;

    return Response.json({ ok: true, message: "Newsletter removed." });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
