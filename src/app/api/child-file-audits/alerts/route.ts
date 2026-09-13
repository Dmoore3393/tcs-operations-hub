import {
  auditSummary,
  type ChildFileAudit,
  type ChildFileAuditItem,
  type ChildFileAuditItemStatus,
} from "@/lib/child-file-audits";
import { normalizeLocation, type LocationKey } from "@/lib/location-config";
import { dispatchFileAuditOversightNotification } from "@/lib/server/notifications";
import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";

type DbRow = Record<string, unknown>;

const AUDIT_LOCATIONS = new Set<LocationKey>([
  "Halcom",
  "21st Street",
  "Division",
  "33rd Street",
  "42nd Street",
  "Tehachapi",
]);

const itemStatuses = new Set<ChildFileAuditItemStatus>(["Not Checked", "On File", "Missing", "N/A"]);

function object(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DbRow : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function todayPacificIso() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function dayDistance(fromIso: string, toIso: string) {
  const from = Date.parse(`${fromIso}T12:00:00Z`);
  const to = Date.parse(`${toIso}T12:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.round((to - from) / 86400000);
}

function weekKey(today: string) {
  const date = new Date(`${today}T12:00:00Z`);
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function safeAuditItem(value: unknown): ChildFileAuditItem | null {
  const item = object(value);
  const documentId = Number(item.documentId);
  if (!Number.isInteger(documentId) || documentId <= 0 || documentId > 100) return null;
  const statusText = text(item.status) as ChildFileAuditItemStatus;
  return {
    documentId,
    status: itemStatuses.has(statusText) ? statusText : "Not Checked",
    dateChecked: text(item.dateChecked).slice(0, 10),
    expirationDate: text(item.expirationDate).slice(0, 10),
    note: text(item.note).slice(0, 500),
  };
}

function safeAudit(value: unknown): ChildFileAudit | null {
  const audit = object(value);
  const id = text(audit.id);
  if (!id) return null;
  const items = Array.isArray(audit.items)
    ? audit.items.map(safeAuditItem).filter((item): item is ChildFileAuditItem => Boolean(item))
    : [];

  return {
    id,
    template: text(audit.template) === "School Age Center" ? "School Age Center" : "In-Home",
    auditDate: text(audit.auditDate).slice(0, 10),
    nextAuditDue: text(audit.nextAuditDue).slice(0, 10),
    dateEnrolled: text(audit.dateEnrolled).slice(0, 10),
    auditedBy: text(audit.auditedBy).slice(0, 160),
    teacherPrimary: text(audit.teacherPrimary).slice(0, 160),
    school: text(audit.school).slice(0, 160),
    grade: text(audit.grade).slice(0, 80),
    signature: text(audit.signature).slice(0, 160),
    notes: text(audit.notes).slice(0, 4000),
    statusFlags: stringArray(audit.statusFlags) as ChildFileAudit["statusFlags"],
    items,
    createdAt: text(audit.createdAt).slice(0, 40),
    updatedAt: text(audit.updatedAt).slice(0, 40),
  };
}

function latestAudit(record: DbRow) {
  const audits = Array.isArray(record.fileAudits)
    ? record.fileAudits.map(safeAudit).filter((audit): audit is ChildFileAudit => Boolean(audit))
    : [];
  return [...audits].sort((a, b) =>
    (b.auditDate || b.updatedAt || "").localeCompare(a.auditDate || a.updatedAt || ""),
  )[0] ?? null;
}

function documentIdsWithExpiration(audit: ChildFileAudit, predicate: (days: number) => boolean, today: string) {
  return audit.items
    .map((item) => {
      if (!item.expirationDate) return null;
      const days = dayDistance(today, item.expirationDate);
      return days !== null && predicate(days) ? item.documentId : null;
    })
    .filter((value): value is number => typeof value === "number");
}

function dueBucket(days: number) {
  if (days <= 1) return "1";
  if (days <= 7) return "7";
  if (days <= 14) return "14";
  return "30";
}

function buildAlert(row: DbRow, today: string) {
  const record = object(row.record_data);
  const legacyId = text(row.legacy_id);
  const locationValue = text(record.location);
  const location = normalizeLocation(locationValue);

  if (!legacyId || !AUDIT_LOCATIONS.has(location)) return null;

  const audit = latestAudit(record);
  const href = `/child-file-audits?child=${encodeURIComponent(legacyId)}`;

  if (!audit) {
    return {
      location,
      href,
      title: "Child file audit missing",
      body: `A child file at ${location} has not been audited yet. Open The Hub to review the secured file.`,
      eventKey: `child-file-audit:none:${legacyId}:${weekKey(today)}`,
      severity: "attention" as const,
    };
  }

  const summary = auditSummary(audit);
  const dueDays = audit.nextAuditDue ? dayDistance(today, audit.nextAuditDue) : null;
  const expiredIds = documentIdsWithExpiration(audit, (days) => days < 0, today);
  const expiringIds = documentIdsWithExpiration(audit, (days) => days >= 0 && days <= 30, today);
  const missingIds = summary.missingRequired.map((item) => item.documentId).sort((a, b) => a - b);

  const reasons: string[] = [];
  let title = "Child file needs attention";
  let severity: "info" | "attention" | "urgent" | "success" = "attention";
  const keyParts = [`audit:${audit.id}`];

  if (!audit.nextAuditDue) {
    reasons.push("next audit date is not set");
    keyParts.push("next-missing");
  } else if (dueDays !== null && dueDays < 0) {
    reasons.push("the file audit is overdue");
    title = "Child file audit overdue";
    severity = "urgent";
    keyParts.push(`overdue:${audit.nextAuditDue}:${weekKey(today)}`);
  } else if (dueDays !== null && dueDays <= 30) {
    reasons.push(`the next audit is due in ${Math.max(0, dueDays)} day${dueDays === 1 ? "" : "s"}`);
    title = "Child file audit due soon";
    keyParts.push(`due:${audit.nextAuditDue}:${dueBucket(dueDays)}`);
  }

  if (expiredIds.length) {
    reasons.push(`${expiredIds.length} document${expiredIds.length === 1 ? "" : "s"} expired`);
    title = "Child file has expired documents";
    severity = "urgent";
    keyParts.push(`expired:${expiredIds.join("-")}`);
  }

  if (missingIds.length) {
    reasons.push(`${missingIds.length} required document${missingIds.length === 1 ? " is" : "s are"} missing or incomplete`);
    if (title === "Child file needs attention") title = "Child file is missing required documents";
    keyParts.push(`missing:${missingIds.join("-")}`);
  }

  if (expiringIds.length) {
    reasons.push(`${expiringIds.length} document${expiringIds.length === 1 ? "" : "s"} expire within 30 days`);
    if (title === "Child file needs attention") title = "Child file documents expiring soon";
    keyParts.push(`expiring:${expiringIds.join("-")}`);
  }

  if (!reasons.length) return null;

  return {
    location,
    href,
    title,
    body: `A child file at ${location} needs attention: ${reasons.join("; ")}. Open The Hub to review the secured file.`,
    eventKey: `child-file-audit:${legacyId}:${keyParts.join(":")}`,
    severity,
  };
}

export async function POST(request: Request) {
  try {
    const { admin, userClient, user, profile, isOwner, isLicensee } = await requireStaff(request);
    if (!isOwner && !isLicensee) {
      throw new Response("Only Owner/Admin and assigned Licensee accounts can scan child file audits.", { status: 403 });
    }

    const body = await request.json().catch(() => ({})) as { childId?: number | string };
    const childId = body.childId ? String(body.childId) : "";
    let query = userClient
      .from("children")
      .select("legacy_id,record_data,enrollment_status")
      .neq("enrollment_status", "Archived");

    if (childId) query = query.eq("legacy_id", childId);

    const result = await query;
    if (result.error) throw result.error;

    const today = todayPacificIso();
    let alertCount = 0;
    let delivered = 0;

    for (const row of (result.data ?? []) as unknown as DbRow[]) {
      const alert = buildAlert(row, today);
      if (!alert) continue;
      alertCount += 1;
      const delivery = await dispatchFileAuditOversightNotification({
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
      delivered += delivery.delivered;
    }

    await userClient.rpc("record_audit_event", {
      p_action: "REVIEW",
      p_table_name: "children",
      p_row_id: null,
      p_location_id: null,
      p_metadata: {
        kind: "child_file_audit_alert_scan",
        scope: childId ? "single_child" : "visible_children",
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
