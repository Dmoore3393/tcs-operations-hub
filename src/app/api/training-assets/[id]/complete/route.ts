import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";
import { trainingAsset } from "@/lib/server/training-assets";
import { canManageTraining } from "@/lib/training-access";
import { TRAINING_ASSET_BUCKET } from "@/lib/training-files";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireStaff(request);
    if (!canManageTraining(auth.profile)) throw new Response("Only training admins can upload training materials.", { status: 403 });
    const asset = await trainingAsset(auth, (await context.params).id);
    if (asset.uploaded_by !== auth.user.id) throw new Response("Only the uploader can finish this upload.", { status: 403 });
    const { data: info, error } = await auth.admin.storage.from(TRAINING_ASSET_BUCKET).info(asset.storage_path);
    if (error || !info) return Response.json({ error: "The file upload has not finished. Please retry the upload." }, { status: 409 });
    if (info.size !== Number(asset.size_bytes) || info.contentType !== asset.mime_type) {
      return Response.json({ error: "The uploaded file does not match the selected file. Please upload it again." }, { status: 400 });
    }
    const { error: saveError } = await auth.admin.from("training_assets").update({ status: "ready" })
      .eq("id", asset.id).eq("organization_id", auth.profile.organization_id).eq("uploaded_by", auth.user.id);
    if (saveError) throw new Error(saveError.message);
    return Response.json({ assetId: asset.id, name: asset.filename, mimeType: asset.mime_type }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return staffErrorResponse(error); }
}
