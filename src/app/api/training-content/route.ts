import { encryptDocument } from "@/lib/server/document-crypto";
import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";
import { tcsLocationSlug } from "@/lib/server/location-slug";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const trainingAdminNames = new Set(["danielle moore", "jennifer thomason", "heather graham"]);
const ALLOWED_EXTENSIONS = new Set(["pdf", "ppt", "pptx"]);
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/octet-stream",
]);

function addYears(date: Date, years: number) {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return next.toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  try {
    const { admin, profile, user, isOwner } = await requireStaff(request);
    const isTrainingAdmin = trainingAdminNames.has((profile.full_name || "").trim().toLowerCase());
    if (!isOwner && !isTrainingAdmin) throw new Response("Training content uploads are restricted to training admins.", { status: 403 });

    const form = await request.formData();
    const file = form.get("file");
    const locationName = String(form.get("location") ?? "").trim();
    const trainingId = String(form.get("trainingId") ?? "draft").trim() || "draft";
    if (!(file instanceof File) || !locationName) return Response.json({ error: "Choose a PowerPoint or PDF file and a location." }, { status: 400 });
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) return Response.json({ error: "Training files must be between 1 byte and 50 MB." }, { status: 400 });

    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTENSIONS.has(extension) || (!ALLOWED_TYPES.has(file.type) && file.type)) {
      return Response.json({ error: "Upload a PDF, PPT, or PPTX training file." }, { status: 400 });
    }

    const slug = tcsLocationSlug(locationName);
    if (!slug) return Response.json({ error: "Choose a valid TCS location." }, { status: 400 });
    const { data: location, error: locationError } = await admin.from("locations").select("id,name").eq("organization_id", profile.organization_id).eq("slug", slug).maybeSingle();
    if (locationError) throw locationError;
    if (!location) return Response.json({ error: "Training location not found." }, { status: 404 });

    const { data: specificPolicy, error: policyError } = await admin.from("retention_policies").select("id,retention_years").eq("document_type", "Training Content").eq("is_active", true).maybeSingle();
    if (policyError) throw policyError;
    const { data: fallbackPolicy, error: fallbackError } = specificPolicy ? { data: null, error: null } : await admin.from("retention_policies").select("id,retention_years").eq("document_type", "Other Child Form").eq("is_active", true).maybeSingle();
    if (fallbackError) throw fallbackError;
    const policy = specificPolicy ?? fallbackPolicy;
    if (!policy) throw new Error("No active retention policy is configured for training content.");

    const plain = Buffer.from(await file.arrayBuffer());
    const encrypted = encryptDocument(plain);
    const documentId = randomUUID();
    const storagePath = `${profile.organization_id}/${location.id}/training-content/${user.id}/${documentId}.enc`;
    const retentionUntil = addYears(new Date(), Math.max(1, policy.retention_years));

    const { error: uploadError } = await admin.storage.from("tcs-sensitive-documents").upload(storagePath, encrypted.encrypted, { contentType: "application/octet-stream", upsert: false });
    if (uploadError) throw uploadError;

    const { data: record, error: recordError } = await admin.from("document_records").insert({
      id: documentId,
      organization_id: profile.organization_id,
      location_id: location.id,
      child_id: null,
      document_type: "Training Content",
      original_filename: file.name,
      storage_path: storagePath,
      mime_type: file.type || "application/octet-stream",
      size_bytes: file.size,
      sha256: encrypted.sha256,
      encryption_algorithm: "AES-256-GCM",
      encryption_iv: encrypted.iv,
      encryption_version: 1,
      retention_policy_id: policy.id,
      retention_until: retentionUntil,
      legal_hold: false,
      status: "Active",
      uploaded_by: user.id,
    }).select("id,original_filename,mime_type,retention_until").single();

    if (recordError) {
      await admin.storage.from("tcs-sensitive-documents").remove([storagePath]);
      throw recordError;
    }

    return Response.json({ ok: true, contentId: record.id, contentName: record.original_filename, contentMimeType: record.mime_type, retentionUntil: record.retention_until, trainingId });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
