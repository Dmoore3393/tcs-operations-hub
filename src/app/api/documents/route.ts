import { encryptDocument } from "@/lib/server/document-crypto";
import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";
import { tcsLocationSlug } from "@/lib/server/location-slug";
import { randomUUID } from "node:crypto";
import { KIDKARE_CLAIM_DOCUMENT, KIDKARE_SCREENSHOT_LIMIT, KIDKARE_SCREENSHOT_TYPES, isKidKareScreenshot, kidKareToday, monthEnd, validClaimMonth } from "@/lib/kidkare-submissions";

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

    const fileId = new URL(request.url).searchParams.get("locationFileId");
    if (fileId && !/^[0-9a-f-]{36}$/i.test(fileId)) return Response.json({error:"Invalid location file."},{status:400});
    let query = userClient
      .from("document_records")
      .select("id,location_id,child_id,location_file_id,document_type,original_filename,mime_type,size_bytes,sha256,encryption_algorithm,encryption_version,retention_until,legal_hold,status,uploaded_by,created_at,locations(name,full_name),children(first_name,last_name)")
      .order("created_at", { ascending: false });
    if (fileId) query = query.eq("location_file_id", fileId);
    const {data,error} = await query;
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
    const locationFileId = String(form.get("locationFileId") ?? "").trim();
    const kidKareClaim = documentType === KIDKARE_CLAIM_DOCUMENT;
    if (locationFileId && kidKareClaim) return Response.json({ error: "KidKare claims are location operations records, not person files." }, { status: 400 });
    const claimMonth = String(form.get("claimMonth") ?? "");

    if (!(file instanceof File) || !locationName || !documentType) {
      return Response.json({ error: "Choose a location, document type, and file." }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
      return Response.json({ error: "The file must be between 1 byte and 15 MB." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return Response.json({ error: "Upload a PDF, JPEG, PNG, HEIC, or HEIF file." }, { status: 400 });
    }
    if (kidKareClaim && (!validClaimMonth(claimMonth) || claimMonth > kidKareToday().slice(0, 7) || childLegacyId)) {
      return Response.json({ error: "Choose the month this location’s KidKare claim covers, without selecting a child." }, { status: 400 });
    }
    if (kidKareClaim && (!KIDKARE_SCREENSHOT_TYPES.includes(file.type) || file.size > KIDKARE_SCREENSHOT_LIMIT)) {
      return Response.json({ error: "Choose a PNG, JPEG, HEIC, or HEIF screenshot under 4 MB." }, { status: 400 });
    }

    const slug = tcsLocationSlug(locationName);
    if (!slug) return Response.json({ error: "Choose a valid TCS location." }, { status: 400 });

    const { data: location, error: locationError } = await userClient
      .from("locations")
      .select("id,name,full_name,program_type,is_active")
      .eq("organization_id", profile.organization_id)
      .eq("slug", slug)
      .maybeSingle();
    if (locationError) throw locationError;
    if (!location) throw new Response("You do not have access to that location.", { status: 403 });
    if (kidKareClaim) {
      const access = await userClient.rpc("can_write_location_module", { p_location_id: location.id, p_module: "kidkare" });
      if (access.error || !access.data) throw new Response("KidKare access to this home is required.", { status: 403 });
      if (location.program_type !== "Family Childcare" || (!location.is_active && claimMonth >= kidKareToday().slice(0, 7))) {
        return Response.json({ error: "Choose an in-home location. Closed homes accept evidence for past months only." }, { status: 400 });
      }
    }

    const { data: policy, error: policyError } = await userClient
      .from("retention_policies")
      .select("id,retention_years,anchor_event")
      .eq("document_type", kidKareClaim ? "CACFP / Meal Record" : documentType)
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
    let linkedFile: { child_id: string | null; staff_lane_id: string | null } | null = null;
    if (locationFileId) {
      if (!/^[0-9a-f-]{36}$/i.test(locationFileId) || childLegacyId) return Response.json({error:"Use the person selected by the location file, not a different child."},{status:400});
      const link = await userClient.from("location_person_files").select("id,organization_id,location_id,child_id,staff_lane_id,archived")
        .eq("id", locationFileId).eq("organization_id", profile.organization_id).maybeSingle();
      if (link.error) throw link.error;
      if (!link.data || link.data.archived || link.data.location_id !== location.id) return Response.json({error:"The location file is not active or does not match this location."},{status:403});
      linkedFile = link.data;
      childId = linkedFile.child_id;
    }
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
    if (kidKareClaim && !isKidKareScreenshot(plain, file.type)) return Response.json({ error: "This file is not a supported screenshot. Save it as a PNG or JPEG and try again." }, { status: 400 });
    const encrypted = encryptDocument(plain);
    if (kidKareClaim) {
      const existing = await userClient.from("document_records").select("id,document_type,original_filename,retention_until,created_at")
        .eq("organization_id", profile.organization_id).eq("location_id", location.id).eq("document_type", KIDKARE_CLAIM_DOCUMENT)
        .eq("source_reference", claimMonth).eq("sha256", encrypted.sha256).eq("status", "Active").limit(1).maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) return Response.json({ ok: true, document: existing.data });
    }
    const documentId = randomUUID();
    const storagePath = `${profile.organization_id}/${location.id}/${documentId}.enc`;
    const anchorDate = kidKareClaim ? new Date(`${monthEnd(claimMonth)}T12:00:00Z`) : anchorDateText ? new Date(`${anchorDateText}T12:00:00Z`) : new Date();
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
        ...(linkedFile ? {location_file_id: locationFileId, document_scope: linkedFile.staff_lane_id ? "Staff" : "Child", confidentiality: "Location Leadership"} : {}),
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
        // Location files retain evidence until leadership reviews departure dates and retention.
        legal_hold: Boolean(linkedFile),
        status: "Active",
        ...(kidKareClaim ? { source_system: "KidKare", source_reference: claimMonth, document_scope: "Operations", confidentiality: "Location Leadership" } : {}),
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
