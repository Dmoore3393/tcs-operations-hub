import { safeFamilyAccess } from "@/lib/family-access";
import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";

type DbRow = Record<string, unknown>;

function object(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DbRow : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function findAuthUserByEmail(
  admin: Awaited<ReturnType<typeof requireStaff>>["admin"],
  email: string,
) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const users = data.users ?? [];
    const match = users.find((user) => (user.email || "").trim().toLowerCase() === email);
    if (match) return match;
    if (users.length < 1000) break;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const { admin, userClient, user, profile, isOwner, isLicensee } = await requireStaff(request);
    if (!isOwner && !isLicensee) {
      throw new Response("Only an Owner/Admin or assigned Licensee can invite Parent Portal accounts.", { status: 403 });
    }

    const body = object(await request.json().catch(() => ({})));
    const childLegacyId = text(body.childLegacyId);
    const adultId = text(body.adultId);

    if (!childLegacyId || !adultId) {
      throw new Response("Choose a child and parent/guardian account to invite.", { status: 400 });
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

    if (!adult) throw new Response("That adult access record was not found.", { status: 404 });
    if (adult.status === "Suspended") {
      throw new Response("This account is suspended. Update the access record before sending an invitation.", { status: 400 });
    }
    if (adult.status === "Pending Approval") {
      throw new Response("This parent already created their account and is waiting for staff approval.", { status: 409 });
    }
    if (adult.status === "Active") {
      throw new Response("This Parent Portal access is already active.", { status: 409 });
    }

    const now = new Date().toISOString();
    const existingUser = await findAuthUserByEmail(admin, adult.email);

    let authUserId = existingUser?.id || "";
    let status: "Pending Approval" | "Invited" = "Invited";
    let acceptedAt = adult.acceptedAt || "";
    let inviteSent = false;

    if (existingUser?.email_confirmed_at) {
      status = "Pending Approval";
      acceptedAt = acceptedAt || now;
    } else {
      const origin = new URL(request.url).origin;
      const { data, error } = await admin.auth.admin.inviteUserByEmail(adult.email, {
        redirectTo: `${origin}/parent/account-setup?mode=invite`,
        data: {
          full_name: adult.name,
          account_type: "parent",
        },
      });

      if (error) {
        const message = error.message || "Could not send the Parent Portal invitation.";
        if (/already|registered|exists/i.test(message) && existingUser) {
          throw new Response(
            "An invitation already exists for this email. Ask the parent to use the most recent invite email, or use Forgot Password after the account is activated.",
            { status: 409 },
          );
        }
        throw error;
      }

      authUserId = data.user?.id || authUserId;
      inviteSent = true;
    }

    const nextAdults = adults.map((entry) => entry.id === adult.id
      ? {
          ...entry,
          status,
          authUserId: authUserId || entry.authUserId,
          invitedAt: inviteSent ? now : entry.invitedAt,
          invitedBy: inviteSent ? (profile.full_name || profile.email) : entry.invitedBy,
          acceptedAt: acceptedAt || undefined,
          approvedAt: undefined,
          approvedBy: undefined,
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
    if (!updated.data) throw new Error("The Parent Portal invitation state was not saved.");

    await admin.from("audit_log").insert({
      organization_id: text(row.organization_id),
      location_id: text(row.location_id) || null,
      actor_user_id: user.id,
      action: "UPDATE",
      table_name: "children",
      row_id: text(row.id),
      metadata: {
        kind: existingUser?.email_confirmed_at ? "parent_portal_existing_account_link_pending_approval" : "parent_portal_invitation_sent",
        childLegacyId,
        adultAccessId: adult.id,
      },
    });

    return Response.json({
      ok: true,
      inviteSent,
      accountAlreadyExists: Boolean(existingUser?.email_confirmed_at),
      status,
      message: existingUser?.email_confirmed_at
        ? "This email already has a verified Parent Portal account. The new child access is waiting for staff approval before it becomes visible."
        : "Parent Portal invitation sent. After the parent creates their password, the account will wait for staff approval before child information is unlocked.",
    });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
