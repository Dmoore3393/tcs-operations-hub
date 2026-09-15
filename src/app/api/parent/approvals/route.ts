import { familyPermissionKeys, safeFamilyAccess } from "@/lib/family-access";
import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";

type DbRow = Record<string, unknown>;

function object(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DbRow : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const { admin, userClient, user, profile, isOwner, isLicensee } = await requireStaff(request);
    if (!isOwner && !isLicensee) {
      throw new Response("Regular Employee accounts cannot approve Parent Portal access. Approval is limited to an Owner/Admin or assigned Location Licensee.", { status: 403 });
    }

    const body = object(await request.json().catch(() => ({})));
    const childLegacyId = text(body.childLegacyId);
    const adultId = text(body.adultId);
    const confirmedIdentity = body.confirmedIdentity === true;
    const confirmedPermissions = body.confirmedPermissions === true;
    const confirmedCustody = body.confirmedCustody === true;

    if (!childLegacyId || !adultId) {
      throw new Response("Choose the parent/guardian account to approve.", { status: 400 });
    }
    if (!confirmedIdentity || !confirmedPermissions) {
      throw new Response("Complete both approval checks before activating Parent Portal access.", { status: 400 });
    }

    const childResult = await userClient
      .from("children")
      .select("id,organization_id,location_id,legacy_id,record_data")
      .eq("organization_id", profile.organization_id)
      .eq("legacy_id", childLegacyId)
      .maybeSingle();

    if (childResult.error) throw childResult.error;
    if (!childResult.data) {
      throw new Response("That child record is not available to your staff account.", { status: 404 });
    }

    const row = childResult.data as unknown as DbRow;
    const record = object(row.record_data);
    const adults = safeFamilyAccess(record.familyAccess);
    const adult = adults.find((entry) => entry.id === adultId);
    const custodyAlert = record.custodyAccessAlert === true;

    if (!adult) throw new Response("That adult access record was not found.", { status: 404 });
    if (adult.status !== "Pending Approval") {
      throw new Response("This account is not currently waiting for approval.", { status: 409 });
    }
    if (!adult.authUserId || !adult.acceptedAt) {
      throw new Response("The parent must finish creating their account before staff can approve access.", { status: 409 });
    }
    if (custodyAlert && !confirmedCustody) {
      throw new Response("This child has a custody/access alert. Review and acknowledge it before approving Parent Portal access.", { status: 400 });
    }

    const now = new Date().toISOString();
    const nextAdults = adults.map((entry) => entry.id === adult.id
      ? {
          ...entry,
          status: "Active" as const,
          approvedAt: now,
          approvedBy: profile.full_name || profile.email,
        }
      : entry);

    const updated = await admin
      .from("children")
      .update({
        record_data: { ...record, familyAccess: nextAdults },
        updated_by: user.id,
      })
      .eq("id", text(row.id))
      .select("id")
      .maybeSingle();

    if (updated.error) throw updated.error;
    if (!updated.data) throw new Error("The Parent Portal approval was not saved.");

    const grantedPermissions = familyPermissionKeys.filter((key) => adult.permissions[key]);

    await admin.from("audit_log").insert({
      organization_id: text(row.organization_id),
      location_id: text(row.location_id) || null,
      actor_user_id: user.id,
      action: "UPDATE",
      table_name: "children",
      row_id: text(row.id),
      metadata: {
        kind: "parent_portal_access_approved",
        childLegacyId,
        adultAccessId: adult.id,
        approvedEmail: adult.email,
        householdId: adult.householdId,
        financialPrivacy: adult.financialPrivacy,
        billingResponsibility: adult.billingResponsibility,
        grantedPermissions,
        confirmedIdentity,
        confirmedPermissions,
        custodyAlert,
        confirmedCustody: custodyAlert ? confirmedCustody : null,
      },
    });

    return Response.json({
      ok: true,
      status: "Active",
      message: `${adult.name}'s Parent Portal access is approved and active.`,
    });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
