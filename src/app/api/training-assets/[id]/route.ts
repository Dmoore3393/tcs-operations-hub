import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";
import { trainingAsset, requireTrainingAssetAccess } from "@/lib/server/training-assets";
import { TRAINING_ASSET_BUCKET } from "@/lib/training-files";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireStaff(request);
    const asset = await trainingAsset(auth, (await context.params).id);
    if (asset.status !== "ready") throw new Response("The training file is not ready yet.", { status: 409 });
    await requireTrainingAssetAccess(auth, asset);
    const { data, error } = await auth.admin.storage.from(TRAINING_ASSET_BUCKET).createSignedUrl(asset.storage_path, 3600,
      asset.kind === "certificate" || asset.mime_type.includes("presentation") || asset.mime_type === "application/vnd.ms-powerpoint" ? { download: asset.filename } : undefined);
    if (error || !data) throw new Error(error?.message || "Could not open the training file.");
    return Response.json({ url: data.signedUrl, name: asset.filename, mimeType: asset.mime_type },
      { headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } });
  } catch (error) { return staffErrorResponse(error); }
}
