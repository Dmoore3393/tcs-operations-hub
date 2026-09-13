import { normalizeTourLead, lastContactActivity, latestTour } from "@/lib/tour-board";
import { normalizeLocation } from "@/lib/location-config";
import { dispatchFileAuditOversightNotification } from "@/lib/server/notifications";
import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";

type DbRow = Record<string, unknown>;

function object(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DbRow : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function todayPacific() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function pacificDateTime() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
}

function daysSince(value: string, now = new Date()) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86400000));
}

function alertForLead(row: DbRow, today: string) {
  const record = object(row.record_data);
  const lead = normalizeTourLead(record);
  if (["Enrolled", "Waitlist", "Declined"].includes(lead.stage)) return null;

  const now = pacificDateTime();
  const location = normalizeLocation(lead.location);
  const href = "/enrollment-pipeline";
  const lastTouch = lastContactActivity(lead);
  const untouchedDays = daysSince(lastTouch?.at || lead.createdAt, now) ?? 0;
  const tour = latestTour(lead);

  let reason = "";
  let title = "Tour Board follow-up needed";
  let severity: "info" | "attention" | "urgent" | "success" = "attention";

  if (lead.followUpDate && lead.followUpDate < today) {
    reason = "an overdue family follow-up";
    severity = lead.priority === "Urgent" ? "urgent" : "attention";
  } else if (lead.followUpDate === today) {
    reason = "a family follow-up due today";
  } else if (tour?.status === "Scheduled" && tour.scheduledAt.slice(0, 10) === today) {
    reason = "a tour scheduled for today";
    title = "Tour scheduled today";
    severity = "info";
  } else if (tour?.status === "Scheduled" && tour.scheduledAt.slice(0, 10) < today) {
    reason = "a past scheduled tour that still needs an outcome";
    title = "Tour outcome needs review";
  } else if (tour?.status === "No Show") {
    const touchAfterNoShow = lead.activity.some((entry) =>
      ["Follow-Up", "Contact", "Reminder"].includes(entry.kind) &&
      entry.at > (tour.loggedAt || tour.scheduledAt),
    );
    if (!touchAfterNoShow) {
      reason = "a no-show that still needs recovery follow-up";
      title = "No-show recovery needed";
    }
  } else if (lead.stage === "New Inquiry" && untouchedDays >= 1) {
    reason = "a new inquiry that has not been contacted within one day";
    title = "New inquiry needs contact";
  } else if ((lead.priority === "Hot Lead" || lead.priority === "Urgent") && untouchedDays >= 1) {
    reason = "a high-priority lead that has gone quiet";
    title = "Hot lead needs attention";
    severity = lead.priority === "Urgent" ? "urgent" : "attention";
  } else if (untouchedDays >= 5) {
    reason = "a lead with no contact activity in five days";
  }

  if (!reason) return null;

  return {
    location,
    href,
    title,
    severity,
    body: `The Tour Board has ${reason} at ${location}. Open The Hub to review the secured lead record.`,
    eventKey: `tour-board-auto:${lead.id}:${title.toLowerCase().replace(/\s+/g, "-")}:${today}`,
  };
}

export async function POST(request: Request) {
  try {
    const { admin, userClient, user, profile, isOwner, isLicensee } = await requireStaff(request);
    if (!isOwner && !isLicensee) {
      throw new Response("Only Owner/Admin and Licensee accounts can run Tour Board follow-up scans.", { status: 403 });
    }

    const result = await userClient
      .from("enrollment_leads")
      .select("legacy_id,record_data,location_id,updated_at")
      .order("updated_at", { ascending: false });

    if (result.error) throw result.error;

    const today = todayPacific();
    let alertCount = 0;
    let delivered = 0;

    for (const row of (result.data ?? []) as unknown as DbRow[]) {
      const alert = alertForLead(row, today);
      if (!alert) continue;
      alertCount += 1;
      const sent = await dispatchFileAuditOversightNotification({
        admin,
        senderUserId: user.id,
        organizationId: profile.organization_id,
        location: alert.location,
        eventKey: alert.eventKey,
        title: alert.title,
        body: alert.body,
        href: alert.href,
        severity: alert.severity,
      });
      delivered += sent.delivered;
    }

    await userClient.rpc("record_audit_event", {
      p_action: "REVIEW",
      p_table_name: "enrollment_leads",
      p_row_id: null,
      p_location_id: null,
      p_metadata: {
        kind: "tour_board_automation_scan",
        alertCount,
        delivered,
      },
    });

    return Response.json({ ok: true, alertCount, delivered }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
    });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
