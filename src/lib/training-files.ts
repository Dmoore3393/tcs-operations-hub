export const TRAINING_ASSET_BUCKET = "training-assets";
export const TRAINING_FILE_LIMIT = 50 * 1024 * 1024;
export const TRAINING_CERTIFICATE_LIMIT = 15 * 1024 * 1024;
export type TrainingAssetKind = "content" | "certificate";

const contentTypes: Record<string, string> = {
  mp4: "video/mp4", pdf: "application/pdf", ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};
const certificateTypes: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };

export function trainingFileDetails(kind: TrainingAssetKind, name: string, size: number, type = "") {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = (kind === "certificate" ? certificateTypes : contentTypes)[extension];
  if (!mimeType || (type && type !== mimeType && type !== "application/octet-stream")) {
    throw new Error(kind === "certificate" ? "Choose a PDF, PNG, or JPG certificate." : "Choose an MP4 video, PDF, PPT, or PPTX training file.");
  }
  const limit = kind === "certificate" ? TRAINING_CERTIFICATE_LIMIT : TRAINING_FILE_LIMIT;
  if (!Number.isSafeInteger(size) || size < 1 || size > limit) {
    throw new Error(`${kind === "certificate" ? "Certificates" : "Training files"} must be between 1 byte and ${limit / 1024 / 1024} MB.`);
  }
  if (name.length > 240 || /[\x00-\x1f\x7f/\\]/.test(name)) throw new Error("Choose a file with a valid filename.");
  return { extension, mimeType };
}
