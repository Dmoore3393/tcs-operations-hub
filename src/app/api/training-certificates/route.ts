import { encryptDocument } from "@/lib/server/document-crypto";
import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";
import { tcsLocationSlug } from "@/lib/server/location-slug";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/heic", "image/heif"]);

function addYears(date: Date, years: number) {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return next.toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  try {
    const { admin, userClient, profile, user } = await requireStaff(request);
    const form = await request.formData();
    const file = form.get("file");
    const locationName = String(form.get("location") ?? "").trim();
    const trainingId = String(form.get("trainingId") ?? "").trim();

    if (!(file instanceof File) || !locationName || !trainingId) {
      return Response.json({ error: "Choose a certificate file and training location." }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
      return Response.json({ error: "The certificate must be between 1 byte and 15 MB." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return Response.json({ error: "Upload a PDF, JPEG, PNG, HEIC, or HEIF certificate." }, { status: 400 });
    }

    const slug = tcsLocationSlug(locationName);
    if (!slug) return Response.json({ error: "Choose a valid TCS location." }, { status: 400 });

    const { data: location, error: locationError } = await userClient
      .from("locations")
      .select("id,name,full_name")
      .eq("slug", slug)
      .maybeSingle();
    if (locationError) throw locationError;
    if (!location) throw new Response("You do not have access to that location.", { status: 403 });

    const { data: policy, error: policyError } = await admin
      .from("retention_policies")
      .select("id,retention_years")
      .eq("document_type", "Training Certificate")
      .eq("is_active", true)
      .maybeSingle();
    if (policyError) throw policyError;

    const { data: fallbackPolicy, error: fallbackError } = policy
      ? { data: null, error: null }
      : await admin
          .from("retention_policies")
          .select("id,retention_years")
          .eq("document_type", "Other Child Form")
          .eq("is_active", true)
          .maybeSingle();
    if (fallbackError) throw fallbackError;
    const activePolicy = policy ?? fallbackPolicy;
    if (!activePolicy) throw new Error("No active retention policy is configured for training certificates.");

    const plain = Buffer.from(await file.arrayBuffer());
    const encrypted = encryptDocument(plain);
    const documentId = randomUUID();
    const storagePath = `${profile.organization_id}/${location.id}/training/${user.id}/${documentId}.enc`;
    const retentionUntil = addYears(new Date(), activePolicy.retention_years);

    const { error: uploadError } = await admin.storage
      .from("tcs-sensitive-documents")
      .upload(storagePath, encrypted.encrypted, { contentType: "application/octet-stream", upsert: false });
    if (uploadError) throw uploadError;

    const { data: record, error: recordError } = await admin
      .from("document_records")
      .insert({
        id: documentId,
        organization_id: profile.organization_id,
        location_id: location.id,
        child_id: null,
        document_type: "Training Certificate",
        original_filename: file.name,
        storage_path: storagePath,
        mime_type: file.type,
        size_bytes: file.size,
        sha256: encrypted.sha256,
        encryption_algorithm: "AES-256-GCM",
        encryption_iv: encrypted.iv,
        encryption_version: 1,
        retention_policy_id: activePolicy.id,
        retention_until: retentionUntil,
        legal_hold: false,
        status: "Active",
        uploaded_by: user.id,
      })
      .select("id,original_filename,retention_until")
      .single();

    if (recordError) {
      await admin.storage.from("tcs-sensitive-documents").remove([storagePath]);
      throw recordError;
    }

    return Response.json({ ok: true, proofId: record.id, proofName: record.original_filename, retentionUntil: record.retention_until, trainingId });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
