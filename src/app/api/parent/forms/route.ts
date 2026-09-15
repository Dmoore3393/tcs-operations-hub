import { parentErrorResponse, requireParent } from "@/lib/server/require-parent";

type DbRow = Record<string, unknown>;

function object(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DbRow : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const { admin, user, email, children } = await requireParent(request);
    if (!children.some((child) => child.access.permissions.viewDocuments)) {
      throw new Response("Forms and documents are not enabled for this Parent Portal account.", { status: 403 });
    }
    const body = object(await request.json().catch(() => ({})));
    const formId = text(body.formId);
    const typedName = text(body.typedName).slice(0, 160);
    const acknowledged = body.acknowledged === true;

    if (!formId || !typedName || !acknowledged) {
      throw new Response("Enter your name and confirm the acknowledgment before submitting.", { status: 400 });
    }

    const byLegacy = await admin
      .from("digital_forms")
      .select("id,legacy_id,organization_id,location_id,record_data")
      .eq("legacy_id", formId)
      .maybeSingle();

    if (byLegacy.error) throw byLegacy.error;

    let row = byLegacy.data as unknown as DbRow | null;
    if (!row && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(formId)) {
      const byId = await admin
        .from("digital_forms")
        .select("id,legacy_id,organization_id,location_id,record_data")
        .eq("id", formId)
        .maybeSingle();
      if (byId.error) throw byId.error;
      row = byId.data as unknown as DbRow | null;
    }

    if (!row) throw new Response("That form request was not found.", { status: 404 });

    const record = object(row.record_data);
    if (text(record.signerEmail).toLowerCase() !== email) {
      throw new Response("This form is not assigned to your Parent Portal account.", { status: 403 });
    }

    if (text(record.signatureMethod) !== "Parent Portal Acknowledgment") {
      throw new Response("This form is not enabled for Parent Portal acknowledgment.", { status: 400 });
    }

    if (!["Ready to Send", "Sent"].includes(text(record.status))) {
      throw new Response("This form is not currently awaiting a Parent Portal acknowledgment.", { status: 400 });
    }

    const signedAt = new Date().toISOString();
    const next = {
      ...record,
      signerName: typedName,
      status: "Signed",
      signatureMethod: "Parent Portal Acknowledgment",
      signedAt,
      verifiedBy: text(record.verifiedBy),
    };

    const updated = await admin
      .from("digital_forms")
      .update({ record_data: next })
      .eq("id", text(row.id))
      .select("id,record_data")
      .maybeSingle();

    if (updated.error) throw updated.error;
    if (!updated.data) throw new Error("The acknowledgment was not returned after saving.");

    await admin.from("audit_log").insert({
      organization_id: text(row.organization_id),
      location_id: text(row.location_id) || null,
      actor_user_id: user.id,
      action: "UPDATE",
      table_name: "digital_forms",
      row_id: text(row.id),
      metadata: {
        kind: "parent_portal_acknowledgment",
        formName: text(record.formName),
        signerEmail: email,
      },
    });

    return Response.json({
      ok: true,
      signedAt,
      formId,
    });
  } catch (error) {
    return parentErrorResponse(error);
  }
}
