import { randomUUID } from "node:crypto";
import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";
import { canManageTraining } from "@/lib/training-access";
import { TRAINING_ASSET_BUCKET, trainingFileDetails } from "@/lib/training-files";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const auth = await requireStaff(request);
    if (!canManageTraining(auth.profile)) throw new Response("Only training admins can upload training materials.", { status: 403 });
    const input = await request.json().catch(() => null);
    if (!input || !["content", "certificate"].includes(input.kind) || typeof input.filename !== "string" ||
      typeof input.trainingId !== "string" || !/^training-[a-z0-9-]{1,100}$/i.test(input.trainingId)) {
      return Response.json({ error: "Choose a training file and a valid training." }, { status: 400 });
    }
    let details;
    try { details = trainingFileDetails(input.kind, input.filename, input.size, input.mimeType); }
    catch (error) { return Response.json({ error: (error as Error).message }, { status: 400 }); }
    const id = randomUUID();
    const path = `${auth.profile.organization_id}/${input.trainingId}/${id}.${details.extension}`;
    const { error } = await auth.admin.from("training_assets").insert({
      id, organization_id: auth.profile.organization_id, training_id: input.trainingId, kind: input.kind,
      filename: input.filename, mime_type: details.mimeType, size_bytes: input.size,
      storage_path: path, status: "pending", uploaded_by: auth.user.id,
    });
    if (error) throw new Error(error.message);
    const { data, error: uploadError } = await auth.admin.storage.from(TRAINING_ASSET_BUCKET).createSignedUploadUrl(path);
    if (uploadError || !data) {
      await auth.admin.from("training_assets").delete().eq("id", id).eq("organization_id", auth.profile.organization_id);
      throw new Error(uploadError?.message || "Could not prepare the upload.");
    }
    return Response.json({ assetId: id, path, token: data.token, bucket: TRAINING_ASSET_BUCKET, mimeType: details.mimeType },
      { headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } });
  } catch (error) { return staffErrorResponse(error); }
}
