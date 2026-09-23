import { requireOwner, responseFromThrown } from "@/lib/server/require-owner";
import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";

export const runtime = "nodejs";

const SUBJECT_TYPES = new Set(["Child","Employee","Family","Transportation","Facility","Vehicle","Operations"]);
const WORKFLOW_TYPES = new Set(["Signature","Acknowledgment","Internal Record","Upload Only"]);
const CONFIDENTIALITY = new Set(["Location Leadership","Owner Only","Staff Self + Owner"]);

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
function boolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

export async function GET(request: Request) {
  try {
    const { admin, profile } = await requireStaff(request);
    const result = await admin
      .from("official_form_templates")
      .select("id,template_key,title,subject_type,workflow_type,current_version,description,requires_signature,requires_verification,default_confidentiality,source_document_id,is_active,created_at,updated_at")
      .eq("organization_id", profile.organization_id)
      .eq("is_active", true)
      .order("subject_type")
      .order("title");
    if (result.error) throw result.error;
    return Response.json({ templates: result.data ?? [] }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
    });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { admin, user, profile } = await requireOwner(request);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const templateKey = text(body.templateKey).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    const title = text(body.title);
    const subjectType = text(body.subjectType);
    const workflowType = text(body.workflowType) || "Signature";
    const confidentiality = text(body.defaultConfidentiality) || "Location Leadership";

    if (!templateKey || !title || !SUBJECT_TYPES.has(subjectType) || !WORKFLOW_TYPES.has(workflowType) || !CONFIDENTIALITY.has(confidentiality)) {
      return Response.json({ error: "Enter a title, subject type, workflow type, and confidentiality setting." }, { status: 400 });
    }

    const result = await admin.from("official_form_templates").insert({
      organization_id: profile.organization_id,
      template_key: templateKey,
      title,
      subject_type: subjectType,
      workflow_type: workflowType,
      current_version: 1,
      description: text(body.description) || null,
      requires_signature: boolean(body.requiresSignature),
      requires_verification: boolean(body.requiresVerification, true),
      default_confidentiality: confidentiality,
      source_document_id: text(body.sourceDocumentId) || null,
      is_active: true,
      created_by: user.id,
      updated_by: user.id,
    }).select("*").single();

    if (result.error) {
      if (result.error.code === "23505") return Response.json({ error: "That template key already exists." }, { status: 409 });
      throw result.error;
    }
    return Response.json({ ok: true, template: result.data });
  } catch (error) {
    return responseFromThrown(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { admin, user, profile } = await requireOwner(request);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const id = text(body.id);
    if (!id) return Response.json({ error: "Template ID is required." }, { status: 400 });

    const updates: Record<string, unknown> = { updated_by: user.id, updated_at: new Date().toISOString() };
    if (typeof body.title === "string") updates.title = text(body.title);
    if (typeof body.description === "string") updates.description = text(body.description) || null;
    if (typeof body.subjectType === "string" && SUBJECT_TYPES.has(text(body.subjectType))) updates.subject_type = text(body.subjectType);
    if (typeof body.workflowType === "string" && WORKFLOW_TYPES.has(text(body.workflowType))) updates.workflow_type = text(body.workflowType);
    if (typeof body.defaultConfidentiality === "string" && CONFIDENTIALITY.has(text(body.defaultConfidentiality))) updates.default_confidentiality = text(body.defaultConfidentiality);
    if (typeof body.requiresSignature === "boolean") updates.requires_signature = body.requiresSignature;
    if (typeof body.requiresVerification === "boolean") updates.requires_verification = body.requiresVerification;
    if (typeof body.isActive === "boolean") updates.is_active = body.isActive;
    if (typeof body.sourceDocumentId === "string") updates.source_document_id = text(body.sourceDocumentId) || null;
    if (body.bumpVersion === true) {
      const current = await admin.from("official_form_templates")
        .select("current_version")
        .eq("organization_id", profile.organization_id)
        .eq("id", id)
        .maybeSingle();
      if (current.error) throw current.error;
      if (!current.data) return Response.json({ error: "Template not found." }, { status: 404 });
      updates.current_version = Number(current.data.current_version || 1) + 1;
    }

    const result = await admin.from("official_form_templates")
      .update(updates)
      .eq("organization_id", profile.organization_id)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return Response.json({ error: "Template not found." }, { status: 404 });

    return Response.json({ ok: true, template: result.data });
  } catch (error) {
    return responseFromThrown(error);
  }
}
