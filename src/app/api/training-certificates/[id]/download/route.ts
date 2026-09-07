import { decryptDocument } from "@/lib/server/document-crypto";
import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";

export const runtime = "nodejs";

const trainingAdminNames = new Set(["danielle moore", "jennifer thomason", "heather graham"]);

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { admin, profile, user, isOwner } = await requireStaff(request);
    const { id } = await context.params;

    const { data: document, error } = await admin
      .from("document_records")
      .select("id,document_type,original_filename,mime_type,storage_path,encryption_iv,uploaded_by,status")
      .eq("id", id)
      .eq("document_type", "Training Certificate")
      .maybeSingle();
    if (error) throw error;
    if (!document || document.status !== "Active") return Response.json({ error: "Certificate not found." }, { status: 404 });

    const isTrainingAdmin = trainingAdminNames.has((profile.full_name || "").trim().toLowerCase());
    if (document.uploaded_by !== user.id && !isOwner && !isTrainingAdmin) {
      throw new Response("You do not have access to this certificate.", { status: 403 });
    }

    const { data: encrypted, error: downloadError } = await admin.storage
      .from("tcs-sensitive-documents")
      .download(document.storage_path);
    if (downloadError || !encrypted) throw downloadError ?? new Error("Certificate file is unavailable.");

    const cipher = Buffer.from(await encrypted.arrayBuffer());
    const plain = decryptDocument(cipher, document.encryption_iv);
    return new Response(plain, {
      headers: {
        "Content-Type": document.mime_type || "application/octet-stream",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(document.original_filename)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
