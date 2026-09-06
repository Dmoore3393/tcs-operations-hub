import { encryptDocument } from "@/lib/server/document-crypto";
import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";
import { tcsLocationSlug } from "@/lib/server/location-slug";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

const DOCUMENT_TYPE = "Transportation Consent 2026-2027";
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/heic", "image/heif"]);

function leadership(profile: { full_name: string; email: string }) {
  const identity = `${profile.full_name} ${profile.email}`.toLowerCase();
  return identity.includes("danielle moore") || identity.includes("jennifer thomason");
}

function allowedLocation(profile: { locations?: string[] }, locationSlug: string, broadAccess: boolean) {
  if (broadAccess) return true;
  return (profile.locations ?? []).some((value) => tcsLocationSlug(value) === locationSlug);
}

function addYears(date: Date, years: number) {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return next.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  try {
    const { admin, profile, isOwner, isLicensee } = await requireStaff(request);
    const isLeadership = leadership(profile as { full_name: string; email: string });
    if (!isOwner && !isLicensee && !isLeadership) throw new Response("Transportation consent records are restricted to authorized leadership and location licensees.", { status: 403 });

    const requestedLocation = new URL(request.url).searchParams.get("location") ?? "";
    const requestedSlug = requestedLocation ? tcsLocationSlug(requestedLocation) : null;

    let locationQuery = admin
      .from("locations")
      .select("id,name,full_name,slug")
      .eq("organization_id", profile.organization_id);
    if (requestedSlug) locationQuery = locationQuery.eq("slug", requestedSlug);
    const { data: locations, error: locationError } = await locationQuery;
    if (locationError) throw locationError;

    const broadAccess = isOwner || isLeadership;
    const allowed = (locations ?? []).filter((location) => allowedLocation(profile as { locations?: string[] }, location.slug, broadAccess));
    const locationIds = allowed.map((location) => location.id);
    if (!locationIds.length) return Response.json({ documents: [] });

    const { data, error } = await admin
      .from("document_records")
      .select("id,location_id,child_id,document_type,original_filename,mime_type,size_bytes,retention_until,status,created_at,locations(name,full_name,slug),children(first_name,last_name,legacy_id)")
      .eq("organization_id", profile.organization_id)
      .eq("document_type", DOCUMENT_TYPE)
      .in("location_id", locationIds)
      .neq("status", "Deleted")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return Response.json({ documents: data ?? [] });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { admin, user, profile, isOwner, isLicensee } = await requireStaff(request);
    const isLeadership = leadership(profile as { full_name: string; email: string });
    if (!isOwner && !isLicensee && !isLeadership) throw new Response("Transportation consent uploads are restricted to authorized leadership and location licensees.", { status: 403 });

    const form = await request.formData();
    const file = form.get("file");
    const locationName = String(form.get("location") ?? "").trim();
    const childLegacyId = String(form.get("childLegacyId") ?? "").trim();
    const anchorDateText = String(form.get("anchorDate") ?? "").trim();
    const locationSlug = tcsLocationSlug(locationName);
    if (!(file instanceof File) || !locationSlug || !childLegacyId) return Response.json({ error: "Choose a child, location, and signed file." }, { status: 400 });
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) return Response.json({ error: "The file must be between 1 byte and 15 MB." }, { status: 400 });
    if (!ALLOWED_TYPES.has(file.type)) return Response.json({ error: "Upload a PDF, JPEG, PNG, HEIC, or HEIF file." }, { status: 400 });

    const broadAccess = isOwner || isLeadership;
    if (!allowedLocation(profile as { locations?: string[] }, locationSlug, broadAccess)) throw new Response("You do not have access to that location.", { status: 403 });

    const { data: location, error: locationError } = await admin
      .from("locations")
      .select("id,name,full_name,slug")
      .eq("organization_id", profile.organization_id)
      .eq("slug", locationSlug)
      .maybeSingle();
    if (locationError) throw locationError;
    if (!location) return Response.json({ error: "Location not found." }, { status: 404 });

    const { data: child, error: childError } = await admin
      .from("children")
      .select("id,legacy_id,first_name,last_name")
      .eq("organization_id", profile.organization_id)
      .eq("legacy_id", childLegacyId)
      .maybeSingle();
    if (childError) throw childError;
    if (!child) return Response.json({ error: "Child not found." }, { status: 404 });

    const { data: membership, error: membershipError } = await admin
      .from("child_location_memberships")
      .select("id")
      .eq("child_id", child.id)
      .eq("location_id", location.id)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return Response.json({ error: "That child is not assigned to the selected location." }, { status: 400 });

    const { data: policy, error: policyError } = await admin
      .from("retention_policies")
      .select("id,retention_years")
      .eq("organization_id", profile.organization_id)
      .eq("document_type", DOCUMENT_TYPE)
      .eq("is_active", true)
      .maybeSingle();
    if (policyError) throw policyError;
    const { data: fallback, error: fallbackError } = policy ? { data: null, error: null } : await admin
      .from("retention_policies")
      .select("id,retention_years")
      .eq("organization_id", profile.organization_id)
      .eq("document_type", "Other Child Form")
      .eq("is_active", true)
      .maybeSingle();
    if (fallbackError) throw fallbackError;
    const activePolicy = policy ?? fallback;
    if (!activePolicy) throw new Error("No active retention policy is configured for transportation consent forms.");

    const plain = Buffer.from(await file.arrayBuffer());
    const encrypted = encryptDocument(plain);
    const documentId = randomUUID();
    const storagePath = `${profile.organization_id}/${location.id}/${documentId}.enc`;
    const anchorDate = anchorDateText ? new Date(`${anchorDateText}T12:00:00Z`) : new Date();
    if (Number.isNaN(anchorDate.getTime())) return Response.json({ error: "The retention anchor date is invalid." }, { status: 400 });

    const { error: uploadError } = await admin.storage.from("tcs-sensitive-documents").upload(storagePath, encrypted.encrypted, { contentType: "application/octet-stream", upsert: false });
    if (uploadError) throw uploadError;

    const { data: record, error: recordError } = await admin
      .from("document_records")
      .insert({
        id: documentId,
        organization_id: profile.organization_id,
        location_id: location.id,
        child_id: child.id,
        document_type: DOCUMENT_TYPE,
        original_filename: file.name,
        storage_path: storagePath,
        mime_type: file.type,
        size_bytes: file.size,
        sha256: encrypted.sha256,
        encryption_algorithm: "AES-256-GCM",
        encryption_iv: encrypted.iv,
        encryption_version: 1,
        retention_policy_id: activePolicy.id,
        retention_until: addYears(anchorDate, activePolicy.retention_years),
        legal_hold: false,
        status: "Active",
        uploaded_by: user.id,
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
