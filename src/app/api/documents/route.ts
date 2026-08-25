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

export async function GET(request: Request) {
  try {
    const { userClient, isOwner, isLicensee } = await requireStaff(request);
    if (!isOwner && !isLicensee) throw new Response("Document vault access is restricted to Owners and Licensees.", { status: 403 });

    const { data, error } = await userClient
      .from("document_records")
      .select("id,location_id,child_id,document_type,original_filename,mime_type,size_bytes,sha256,encryption_algorithm,encryption_version,retention_until,legal_hold,status,uploaded_by,created_at,locations(name,full_name),children(first_name,last_name)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return Response.json({ documents: data ?? [] });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { admin, userClient, profile, isOwner, isLicensee } = await requireStaff(request);
    if (!isOwner && !isLicensee) throw new Response("Document uploads are restricted to Owners and Licensees.", { status: 403 });

    const form = await request.formData();
    const file = form.get("file");
    const locationName = String(form.get("location") ?? "").trim();
    const documentType = String(form.get("documentType") ?? "").trim();
    const childLegacyId = String(form.get("childLegacyId") ?? "").trim();
    const anchorDateText = String(form.get("anchorDate") ?? "").trim();

    if (!(file instanceof File) || !locationName || !documentType) {
      return Response.json({ error: "Choose a location, document type, and file." }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
      return Response.json({ error: "The file must be between 1 byte and 15 MB." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return Response.json({ error: "Upload a PDF, JPEG, PNG, HEIC, or HEIF file." }, { status: 400 });
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

    const { data: policy, error: policyError } = await userClient
      .from("retention_policies")
      .select("id,retention_years,anchor_event")
      .eq("document_type", documentType)
      .eq("is_active", true)
      .maybeSingle();
    if (policyError) throw policyError;

    const { data: fallbackPolicy, error: fallbackError } = policy
      ? { data: null, error: null }
      : await userClient
          .from("retention_policies")
          .select("id,retention_years,anchor_event")
          .eq("document_type", "Other Child Form")
          .eq("is_active", true)
          .maybeSingle();
    if (fallbackError) throw fallbackError;
    const activePolicy = policy ?? fallbackPolicy;
    if (!activePolicy) throw new Error("No active retention policy is configured for document uploads.");

    let childId: string | null = null;
    if (childLegacyId) {
      const { data: child, error: childError } = await userClient
        .from("children")
        .select("id")
        .eq("legacy_id", childLegacyId)
        .maybeSingle();
      if (childError) throw childError;
      if (!child) return Response.json({ error: "The selected child is not available to this account." }, { status: 403 });

      const { data: membership, error: membershipError } = await userClient
        .from("child_location_memberships")
        .select("id")
        .eq("child_id", child.id)
        .eq("location_id", location.id)
        .maybeSingle();
      if (membershipError) throw membershipError;
      if (!membership) return Response.json({ error: "That child is not assigned to the selected location." }, { status: 400 });
      childId = child.id;
    }

    const plain = Buffer.from(await file.arrayBuffer());
    const encrypted = encryptDocument(plain);
    const documentId = randomUUID();
    const storagePath = `${profile.organization_id}/${location.id}/${documentId}.enc`;
    const anchorDate = anchorDateText ? new Date(`${anchorDateText}T12:00:00Z`) : new Date();
    if (Number.isNaN(anchorDate.getTime())) return Response.json({ error: "The retention anchor date is invalid." }, { status: 400 });
    const retentionUntil = addYears(anchorDate, activePolicy.retention_years);

    const { error: uploadError } = await admin.storage
      .from("tcs-sensitive-documents")
      .upload(storagePath, encrypted.encrypted, { contentType: "application/octet-stream", upsert: false });
    if (uploadError) throw uploadError;

    const { data: record, error: recordError } = await userClient
      .from("document_records")
      .insert({
        id: documentId,
        organization_id: profile.organization_id,
        location_id: location.id,
        child_id: childId,
        document_type: documentType,
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
      })
      .select("id,document_type,original_filename,retention_until,created_at")
      .single();

    if (recordError) {
      await admin.storage.from("tcs-sensitive-documents").remove([storagePath]);
      throw recordError;
    }

    return Response.json({ ok: true, document: record });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
