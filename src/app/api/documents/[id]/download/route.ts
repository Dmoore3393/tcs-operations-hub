import { decryptDocument } from "@/lib/server/document-crypto";
import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { admin, userClient, isOwner, isLicensee } = await requireStaff(request);
    if (!isOwner && !isLicensee) throw new Response("Document vault access is restricted.", { status: 403 });

    const { data: record, error } = await userClient
      .from("document_records")
      .select("id,location_id,storage_path,original_filename,mime_type,encryption_iv,status")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!record || record.status === "Deleted") return Response.json({ error: "Document not found." }, { status: 404 });

    const { data: encryptedBlob, error: downloadError } = await admin.storage
      .from("tcs-sensitive-documents")
      .download(record.storage_path);
    if (downloadError || !encryptedBlob) throw downloadError ?? new Error("Encrypted file is missing.");

    const encrypted = Buffer.from(await encryptedBlob.arrayBuffer());
    const plain = decryptDocument(encrypted, record.encryption_iv);

    await userClient.rpc("record_audit_event", {
      p_action: "EXPORT",
      p_table_name: "document_records",
      p_row_id: record.id,
      p_location_id: record.location_id,
      p_metadata: { kind: "document_download", filename: record.original_filename },
    });

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
