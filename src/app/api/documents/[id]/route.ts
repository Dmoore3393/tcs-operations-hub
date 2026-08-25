import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";

export const runtime = "nodejs";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { admin, userClient, isOwner } = await requireStaff(request);
    if (!isOwner) throw new Response("Only an Owner/Admin can delete retained documents.", { status: 403 });

    const { data: record, error } = await userClient
      .from("document_records")
      .select("id,storage_path,retention_until,legal_hold,status")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!record) return Response.json({ error: "Document not found." }, { status: 404 });
    if (record.legal_hold) return Response.json({ error: "This document is under legal hold and cannot be deleted." }, { status: 409 });
    if (record.retention_until > new Date().toISOString().slice(0, 10)) {
      return Response.json({ error: `Retention prevents deletion until ${record.retention_until}. Archive it instead.` }, { status: 409 });
    }

    const { error: storageError } = await admin.storage.from("tcs-sensitive-documents").remove([record.storage_path]);
    if (storageError) throw storageError;
    const { error: deleteError } = await userClient.from("document_records").delete().eq("id", id);
    if (deleteError) throw deleteError;
    return Response.json({ ok: true });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
