import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";

export const runtime = "nodejs";

const BUCKET = "child-media";
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

type DbRow = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeFileName(value: string) {
  const clean = value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return clean.slice(-100) || "photo";
}

function canManageMedia(profile: { permissions: string[] }, isOwner: boolean, isLicensee: boolean) {
  return isOwner || isLicensee || profile.permissions.includes("daily_care") || profile.permissions.includes("children_basic");
}

async function resolveChild(
  admin: Awaited<ReturnType<typeof requireStaff>>["admin"],
  organizationId: string,
  childLegacyId: string,
) {
  const result = await admin
    .from("children")
    .select("id,legacy_id,location_id,first_name,last_name")
    .eq("organization_id", organizationId)
    .eq("legacy_id", childLegacyId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Response("That child was not found.", { status: 404 });
  return result.data;
}

async function assertLocationAccess(
  admin: Awaited<ReturnType<typeof requireStaff>>["admin"],
  organizationId: string,
  userId: string,
  locationId: string,
  isOwner: boolean,
) {
  if (isOwner) return;
  const result = await admin
    .from("staff_location_assignments")
    .select("location_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("location_id", locationId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Response("This child is outside your assigned location.", { status: 403 });
}

async function signedUrl(
  admin: Awaited<ReturnType<typeof requireStaff>>["admin"],
  objectPath: string,
) {
  const result = await admin.storage.from(BUCKET).createSignedUrl(objectPath, 60 * 60);
  if (result.error) return "";
  return result.data.signedUrl;
}

export async function GET(request: Request) {
  try {
    const { admin, user, profile, isOwner, isLicensee } = await requireStaff(request);
    if (!canManageMedia(profile, isOwner, isLicensee)) throw new Response("Child photo access is required.", { status: 403 });

    const url = new URL(request.url);
    const childId = text(url.searchParams.get("childId"));
    if (!childId) throw new Response("Choose a child.", { status: 400 });

    const child = await resolveChild(admin, profile.organization_id, childId);
    await assertLocationAccess(admin, profile.organization_id, user.id, child.location_id, isOwner);

    const mediaResult = await admin
      .from("child_media")
      .select("id,media_kind,service_date,caption,object_path,mime_type,size_bytes,visible_to_family,photo_consent_verified,created_by_name,created_at")
      .eq("organization_id", profile.organization_id)
      .eq("child_id", child.id)
      .order("service_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(60);
    if (mediaResult.error) throw mediaResult.error;

    const media = await Promise.all(((mediaResult.data ?? []) as unknown as DbRow[]).map(async (row) => ({
      id: text(row.id),
      kind: text(row.media_kind),
      date: text(row.service_date),
      caption: text(row.caption),
      mimeType: text(row.mime_type),
      sizeBytes: Number(row.size_bytes) || 0,
      visibleToFamily: row.visible_to_family === true,
      consentVerified: row.photo_consent_verified === true,
      uploadedBy: text(row.created_by_name),
      createdAt: text(row.created_at),
      url: await signedUrl(admin, text(row.object_path)),
    })));

    return Response.json({
      child: {
        id: child.legacy_id,
        name: `${child.first_name} ${child.last_name}`.trim(),
      },
      media,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { admin, user, profile, isOwner, isLicensee } = await requireStaff(request);
    if (!canManageMedia(profile, isOwner, isLicensee)) throw new Response("Child photo access is required.", { status: 403 });

    const form = await request.formData();
    const childId = text(form.get("childId"));
    const kind = text(form.get("kind")) === "Profile" ? "Profile" : "Daily Photo";
    const serviceDate = text(form.get("serviceDate")).slice(0, 10);
    const caption = text(form.get("caption")).slice(0, 500);
    const consentVerified = text(form.get("consentVerified")) === "true";
    const file = form.get("file");

    if (!childId) throw new Response("Choose a child.", { status: 400 });
    if (!(file instanceof File)) throw new Response("Choose a photo to upload.", { status: 400 });
    if (!consentVerified) throw new Response("Verify the child's photo consent before uploading.", { status: 400 });
    if (!ALLOWED_MIME.has(file.type)) throw new Response("Use a JPG, PNG, or WebP image.", { status: 415 });
    if (file.size <= 0 || file.size > MAX_BYTES) throw new Response("Photos must be 8 MB or smaller.", { status: 413 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) throw new Response("Choose a valid photo date.", { status: 400 });

    const child = await resolveChild(admin, profile.organization_id, childId);
    await assertLocationAccess(admin, profile.organization_id, user.id, child.location_id, isOwner);

    const path = `${profile.organization_id}/${child.id}/${kind === "Profile" ? "profile" : serviceDate}/${Date.now()}-${safeFileName(file.name)}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const upload = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type,
      upsert: false,
      cacheControl: "3600",
    });
    if (upload.error) throw upload.error;

    try {
      if (kind === "Profile") {
        const oldProfile = await admin
          .from("child_media")
          .select("id,object_path")
          .eq("organization_id", profile.organization_id)
          .eq("child_id", child.id)
          .eq("media_kind", "Profile")
          .maybeSingle();
        if (oldProfile.error) throw oldProfile.error;
        if (oldProfile.data?.object_path) {
          await admin.storage.from(BUCKET).remove([oldProfile.data.object_path]);
          const removed = await admin.from("child_media").delete().eq("id", oldProfile.data.id);
          if (removed.error) throw removed.error;
        }
      }

      const inserted = await admin
        .from("child_media")
        .insert({
          organization_id: profile.organization_id,
          location_id: child.location_id,
          child_id: child.id,
          child_legacy_id: child.legacy_id,
          media_kind: kind,
          service_date: serviceDate,
          caption: caption || null,
          object_path: path,
          mime_type: file.type,
          size_bytes: file.size,
          visible_to_family: true,
          photo_consent_verified: true,
          created_by: user.id,
          created_by_name: profile.full_name || profile.email,
        })
        .select("id")
        .single();
      if (inserted.error) throw inserted.error;

      return Response.json({
        ok: true,
        id: inserted.data.id,
        message: kind === "Profile" ? "Profile picture updated." : "Daily photo added for the family.",
      });
    } catch (error) {
      await admin.storage.from(BUCKET).remove([path]);
      throw error;
    }
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { admin, user, profile, isOwner, isLicensee } = await requireStaff(request);
    if (!canManageMedia(profile, isOwner, isLicensee)) throw new Response("Child photo access is required.", { status: 403 });

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const id = text(body.id);
    if (!id) throw new Response("Choose a photo.", { status: 400 });

    const mediaResult = await admin
      .from("child_media")
      .select("id,child_id,location_id,object_path")
      .eq("organization_id", profile.organization_id)
      .eq("id", id)
      .maybeSingle();
    if (mediaResult.error) throw mediaResult.error;
    if (!mediaResult.data) throw new Response("That photo was not found.", { status: 404 });

    await assertLocationAccess(admin, profile.organization_id, user.id, mediaResult.data.location_id, isOwner);

    const storageResult = await admin.storage.from(BUCKET).remove([mediaResult.data.object_path]);
    if (storageResult.error) throw storageResult.error;
    const removed = await admin.from("child_media").delete().eq("id", id);
    if (removed.error) throw removed.error;

    return Response.json({ ok: true, message: "Photo removed." });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
