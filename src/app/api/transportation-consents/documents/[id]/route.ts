import { decryptDocument } from "@/lib/server/document-crypto";
import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";
import { tcsLocationSlug } from "@/lib/server/location-slug";

export const runtime = "nodejs";
const DOCUMENT_TYPE = "Transportation Consent 2026-2027";

function leadership(profile: { full_name: string; email: string }) {
  const identity = `${profile.full_name} ${profile.email}`.toLowerCase();
  return identity.includes("danielle moore") || identity.includes("jennifer thomason");
}

function canUseLocation(profile: { locations?: string[] }, slug: string, broadAccess: boolean) {
  return broadAccess || (profile.locations ?? []).some((value) => tcsLocationSlug(value) === slug);
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { admin, userClient, profile, isOwner, isLicensee } = await requireStaff(request);
    const isLeadership = leadership(profile as { full_name: string; email: string });
    if (!isOwner && !isLicensee && !isLeadership) throw new Response("Transportation consent records are restricted.", { status: 403 });

    const { data: record, error } = await admin
      .from("document_records")
      .select("id,organization_id,location_id,storage_path,original_filename,mime_type,encryption_iv,status,document_type,locations(slug)")
      .eq("id", id)
      .eq("organization_id", profile.organization_id)
      .maybeSingle();
    if (error) throw error;
    if (!record || record.status === "Deleted" || record.document_type !== DOCUMENT_TYPE) return Response.json({ error: "Transportation consent not found." }, { status: 404 });

    const locationRelation = record.locations as unknown as { slug?: string } | { slug?: string }[] | null;
    const slug = Array.isArray(locationRelation) ? String(locationRelation[0]?.slug ?? "") : String(locationRelation?.slug ?? "");
    if (!canUseLocation(profile as { locations?: string[] }, slug, isOwner || isLeadership)) throw new Response("You do not have access to this location.", { status: 403 });

    const { data: encryptedBlob, error: downloadError } = await admin.storage.from("tcs-sensitive-documents").download(record.storage_path);
    if (downloadError || !encryptedBlob) throw downloadError ?? new Error("Encrypted file is missing.");
    const plain = decryptDocument(Buffer.from(await encryptedBlob.arrayBuffer()), record.encryption_iv);

    try {
      await userClient.rpc("record_audit_event", {
        p_action: "EXPORT",
        p_table_name: "document_records",
        p_row_id: record.id,
        p_location_id: record.location_id,
        p_metadata: { kind: "transportation_consent_download", filename: record.original_filename },
      });
    } catch {
      // Download still remains scoped and encrypted even if audit RPC is unavailable.
    }

    const safeName = record.original_filename.replace(/[\r\n"\\]/g, "_");
    return new Response(new Uint8Array(plain), {
      headers: {
        "Content-Type": record.mime_type,
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
