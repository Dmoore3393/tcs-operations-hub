import { parentErrorResponse, requireParent } from "@/lib/server/require-parent";

export const runtime = "nodejs";

const BUCKET = "child-media";
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeFileName(value: string) {
  const clean = value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return clean.slice(-100) || "profile-photo";
}

export async function POST(request: Request) {
  try {
    const { admin, user, email, children } = await requireParent(request);
    const form = await request.formData();
    const childId = text(form.get("childId"));
    const file = form.get("file");

    if (!childId) throw new Response("Choose a child.", { status: 400 });
    if (!(file instanceof File)) throw new Response("Choose a profile picture.", { status: 400 });
    if (!ALLOWED_MIME.has(file.type)) throw new Response("Use a JPG, PNG, or WebP image.", { status: 415 });
    if (file.size <= 0 || file.size > MAX_BYTES) throw new Response("Profile pictures must be 8 MB or smaller.", { status: 413 });

    const child = children.find((entry) => entry.legacyId === childId);
    if (!child) throw new Response("That child is not linked to your Parent Portal account.", { status: 404 });
    if (!child.access.permissions.viewProfile) {
      throw new Response("Your Parent Portal access does not include profile updates for this child.", { status: 403 });
    }

    const path = `${child.organizationId}/${child.rowId}/profile/${Date.now()}-${safeFileName(file.name)}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const upload = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type,
      upsert: false,
      cacheControl: "3600",
    });
    if (upload.error) throw upload.error;

    try {
      const oldProfile = await admin
        .from("child_media")
        .select("id,object_path")
        .eq("organization_id", child.organizationId)
        .eq("child_id", child.rowId)
        .eq("media_kind", "Profile")
        .maybeSingle();
      if (oldProfile.error) throw oldProfile.error;

      if (oldProfile.data?.object_path) {
        const removedFile = await admin.storage.from(BUCKET).remove([oldProfile.data.object_path]);
        if (removedFile.error) throw removedFile.error;
        const removedRow = await admin.from("child_media").delete().eq("id", oldProfile.data.id);
        if (removedRow.error) throw removedRow.error;
      }

      const saved = await admin
        .from("child_media")
        .insert({
          organization_id: child.organizationId,
          location_id: child.locationId,
          child_id: child.rowId,
          child_legacy_id: child.legacyId,
          media_kind: "Profile",
          service_date: new Date().toISOString().slice(0, 10),
          caption: "Profile picture uploaded by family",
          object_path: path,
          mime_type: file.type,
          size_bytes: file.size,
          visible_to_family: true,
          photo_consent_verified: true,
          created_by: user.id,
          created_by_name: email,
        })
        .select("id")
        .single();
      if (saved.error) throw saved.error;

      await admin.from("audit_log").insert({
        organization_id: child.organizationId,
        location_id: child.locationId,
        actor_user_id: user.id,
        action: "INSERT",
        table_name: "child_media",
        row_id: saved.data.id,
        metadata: {
          kind: "family_profile_photo_uploaded",
          childLegacyId: child.legacyId,
        },
      });

      return Response.json({
        ok: true,
        id: saved.data.id,
        message: "Profile picture updated. 💚",
      });
    } catch (error) {
      await admin.storage.from(BUCKET).remove([path]);
      throw error;
    }
  } catch (error) {
    return parentErrorResponse(error);
  }
}
