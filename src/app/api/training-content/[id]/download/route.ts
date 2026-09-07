import { decryptDocument } from "@/lib/server/document-crypto";
import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { admin, profile } = await requireStaff(request);
    const { id } = await context.params;
    const { data: document, error } = await admin
      .from("document_records")
      .select("id,organization_id,document_type,original_filename,mime_type,storage_path,encryption_iv,status")
      .eq("id", id)
      .eq("organization_id", profile.organization_id)
      .eq("document_type", "Training Content")
      .maybeSingle();
    if (error) throw error;
    if (!document || document.status !== "Active") return Response.json({ error: "Training content not found." }, { status: 404 });

    const { data: encrypted, error: downloadError } = await admin.storage.from("tcs-sensitive-documents").download(document.storage_path);
    if (downloadError || !encrypted) throw downloadError ?? new Error("Training content is unavailable.");
    const cipher = Buffer.from(await encrypted.arrayBuffer());
    const plain = decryptDocument(cipher, document.encryption_iv);
    const inline = document.mime_type === "application/pdf";
    return new Response(plain, {
      headers: {
        "Content-Type": document.mime_type || "application/octet-stream",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(document.original_filename)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
