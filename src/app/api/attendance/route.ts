import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";

type DbRow = Record<string, unknown>;

function object(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DbRow : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function pacificDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function authorizedPickupNames(record: DbRow) {
  return [
    text(record.primaryGuardian),
    text(record.secondaryGuardian),
    text(record.emergencyContact1Name),
    text(record.emergencyContact2Name),
  ].filter(Boolean);
}

function matchesAuthorizedPickup(name: string, authorized: string[]) {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, " ");
  return authorized.some((item) => item.trim().toLowerCase().replace(/\s+/g, " ") === normalized);
}

export async function POST(request: Request) {
  try {
    const { userClient, profile, isOwner, isLicensee } = await requireStaff(request);
    const permissions = Array.isArray(profile.permissions) ? profile.permissions : [];
    if (!isOwner && !isLicensee && !["children_basic", "schedules"].some((permission) => permissions.includes(permission))) {
      throw new Response("This staff account cannot check children in or out.", { status: 403 });
    }

    const body = object(await request.json().catch(() => ({})));
    const childId = text(body.childId);
    const action = text(body.action);
    if (!childId || !["checkin", "checkout", "absent", "reset"].includes(action)) {
      throw new Response("Choose a valid child and attendance action.", { status: 400 });
    }

    const current = await userClient
      .from("children")
      .select("id,legacy_id,record_data,attendance_status,location_id")
      .eq("organization_id", profile.organization_id)
      .eq("legacy_id", childId)
      .maybeSingle();

    if (current.error) throw current.error;
    if (!current.data) throw new Response("That child record is not available to this staff account.", { status: 404 });

    const record = object(current.data.record_data);
    const now = new Date().toISOString();
    const date = pacificDate();
    const next: DbRow = { ...record };
    let attendanceStatus = text(current.data.attendance_status) || "Not Scheduled";
    let auditAction = "REVIEW";
    const auditMetadata: DbRow = { kind: "child_attendance", action, childId };

    if (action === "checkin") {
      attendanceStatus = "Present";
      next.attendanceToday = "Present";
      next.attendanceDate = date;
      next.checkedInAt = now;
      next.checkedInBy = profile.full_name || profile.email;
      next.checkedOutAt = "";
      next.checkedOutBy = "";
      next.pickupPerson = "";
      next.pickupVerification = "Not Applicable";
      next.pickupNotes = "";
      auditAction = "UPDATE";
    }

    if (action === "absent") {
      attendanceStatus = "Absent";
      next.attendanceToday = "Absent";
      next.attendanceDate = date;
      next.checkedOutAt = "";
      next.checkedOutBy = "";
      next.pickupPerson = "";
      next.pickupVerification = "Not Applicable";
      next.pickupNotes = "";
      auditAction = "UPDATE";
    }

    if (action === "reset") {
      attendanceStatus = "Not Scheduled";
      next.attendanceToday = "Not Scheduled";
      next.attendanceDate = date;
      next.checkedInAt = "";
      next.checkedInBy = "";
      next.checkedOutAt = "";
      next.checkedOutBy = "";
      next.pickupPerson = "";
      next.pickupVerification = "Not Applicable";
      next.pickupNotes = "";
      auditAction = "UPDATE";
    }

    if (action === "checkout") {
      const pickupPerson = text(body.pickupPerson).slice(0, 160);
      const pickupNotes = text(body.pickupNotes).slice(0, 1000);
      if (!pickupPerson) throw new Response("Enter the person picking the child up.", { status: 400 });

      const authorized = authorizedPickupNames(record);
      const authorizedMatch = matchesAuthorizedPickup(pickupPerson, authorized);
      const canOverride = isOwner || isLicensee;

      if (!authorizedMatch && !canOverride) {
        throw new Response("Pickup is blocked because this person is not listed in the child record. Ask the site Licensee or Owner/Admin to verify the pickup.", { status: 403 });
      }
      if (!authorizedMatch && canOverride && pickupNotes.length < 5) {
        throw new Response("Enter an override note explaining how pickup authorization was verified.", { status: 400 });
      }

      attendanceStatus = "Checked Out";
      next.attendanceToday = "Checked Out";
      next.attendanceDate = date;
      next.checkedOutAt = now;
      next.checkedOutBy = profile.full_name || profile.email;
      next.pickupPerson = pickupPerson;
      next.pickupVerification = authorizedMatch ? "Authorized Contact" : "Licensee Override";
      next.pickupNotes = pickupNotes;
      auditAction = "UPDATE";
      auditMetadata.pickupVerification = next.pickupVerification;
      auditMetadata.overrideUsed = !authorizedMatch;
    }

    const updated = await userClient
      .from("children")
      .update({
        attendance_status: attendanceStatus,
        record_data: next,
      })
      .eq("id", current.data.id)
      .select("legacy_id,record_data,attendance_status,updated_at")
      .maybeSingle();

    if (updated.error) throw updated.error;
    if (!updated.data) throw new Error("The attendance update was not returned.");

    await userClient.rpc("record_audit_event", {
      p_action: auditAction,
      p_table_name: "children",
      p_row_id: current.data.id,
      p_location_id: current.data.location_id,
      p_metadata: auditMetadata,
    });

    return Response.json({
      ok: true,
      childId,
      attendanceStatus,
      attendanceDate: date,
      checkedInAt: text(object(updated.data.record_data).checkedInAt),
      checkedOutAt: text(object(updated.data.record_data).checkedOutAt),
      pickupVerification: text(object(updated.data.record_data).pickupVerification),
    });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
