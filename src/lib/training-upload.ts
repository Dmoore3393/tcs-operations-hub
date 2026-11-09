import { Upload } from "tus-js-client";
import { hubRequest } from "@/lib/hub-request";
import { trainingFileDetails, type TrainingAssetKind } from "@/lib/training-files";

export async function uploadTrainingAsset(file: File, kind: TrainingAssetKind, trainingId: string, token: string, onProgress: (percent: number) => void) {
  trainingFileDetails(kind, file.name, file.size, file.type);
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!projectUrl) throw new Error("Training storage is not configured.");
  const endpoint = new URL("/storage/v1/upload/resumable", projectUrl);
  if (endpoint.hostname.endsWith(".supabase.co") && !endpoint.hostname.endsWith(".storage.supabase.co")) {
    endpoint.hostname = endpoint.hostname.replace(".supabase.co", ".storage.supabase.co");
  }
  const prepared = await hubRequest<{ assetId: string; path: string; token: string; bucket: string; mimeType: string }>("/api/training-assets", token, {
    method: "POST", body: JSON.stringify({ trainingId, kind, filename: file.name, size: file.size, mimeType: file.type }),
  });
  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: endpoint.toString(), headers: { "x-signature": prepared.token },
      chunkSize: 6 * 1024 * 1024, retryDelays: [0, 3000, 5000, 10000, 20000],
      uploadDataDuringCreation: true, removeFingerprintOnSuccess: true, storeFingerprintForResuming: false,
      metadata: { bucketName: prepared.bucket, objectName: prepared.path, contentType: prepared.mimeType, cacheControl: "0" },
      onProgress: (uploaded, total) => onProgress(Math.round(uploaded / total * 100)),
      onError: () => reject(new Error("The upload was interrupted. Check your connection and try again; your form is still here.")),
      onSuccess: () => resolve(),
    });
    upload.start();
  });
  return hubRequest<{ assetId: string; name: string; mimeType: string }>(`/api/training-assets/${prepared.assetId}/complete`, token, { method: "POST" });
}
