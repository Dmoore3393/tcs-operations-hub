import { auditSummary, type ChildFileAudit } from "@/lib/child-file-audits";
import { defaultImmunizationProgram, immunizationStatus, normalizeImmunizationRecord } from "@/lib/immunization-tracker";
import { parentErrorResponse, requireParent } from "@/lib/server/require-parent";

type DbRow = Record<string, unknown>;

function object(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DbRow : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function latestAudit(record: DbRow): ChildFileAudit | null {
  const audits = Array.isArray(record.fileAudits) ? record.fileAudits as ChildFileAudit[] : [];
  return [...audits].sort((a, b) =>
    (b.auditDate || b.updatedAt || "").localeCompare(a.auditDate || a.updatedAt || ""),
  )[0] ?? null;
}

export async function GET(request: Request) {
  try {
    const { admin, email, children } = await requireParent(request);
    const rowIds = children.map((child) => child.rowId);

    const [careResult, formsResult] = await Promise.all([
      rowIds.length
        ? admin
            .from("daily_care_entries")
            .select("id,child_id,entry_date,entry_time,category,action,result,notes,created_at")
            .in("child_id", rowIds)
            .order("entry_date", { ascending: false })
            .order("entry_time", { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [], error: null }),
      admin
        .from("digital_forms")
        .select("id,legacy_id,organization_id,location_id,record_data,created_at,updated_at")
        .order("updated_at", { ascending: false }),
    ]);

    if (careResult.error) throw careResult.error;
    if (formsResult.error) throw formsResult.error;

    const childByRow = new Map(children.map((child) => [child.rowId, child]));
    const careEntries = ((careResult.data ?? []) as unknown as DbRow[]).map((row) => {
      const child = childByRow.get(text(row.child_id));
      return {
        id: text(row.id),
        childId: child?.legacyId || "",
        date: text(row.entry_date),
        time: text(row.entry_time),
        category: text(row.category),
        action: text(row.action),
        result: text(row.result),
        notes: text(row.notes),
      };
    }).filter((item) => item.childId);

    const parentForms = ((formsResult.data ?? []) as unknown as DbRow[])
      .map((row) => {
        const record = object(row.record_data);
        if (text(record.signerEmail).toLowerCase() !== email) return null;
        return {
          id: text(row.legacy_id) || text(row.id),
          subjectName: text(record.subjectName),
          formName: text(record.formName),
          signerName: text(record.signerName),
          status: text(record.status),
          signatureMethod: text(record.signatureMethod),
          requestedAt: text(record.requestedAt),
          dueDate: text(record.dueDate),
          signedAt: text(record.signedAt),
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    const safeChildren = children.map((child) => {
      const record = child.record;
      const audit = latestAudit(record);
      const immunization = normalizeImmunizationRecord(
        object(record.immunizationRecord),
        defaultImmunizationProgram(text(record.ageGroup), text(record.location)),
      );
      const shotStatus = immunizationStatus(text(record.dateOfBirth), immunization);
      const auditState = audit ? auditSummary(audit) : null;

      return {
        id: child.legacyId,
        firstName: text(record.firstName),
        lastName: text(record.lastName),
        ageGroup: text(record.ageGroup),
        location: text(record.location),
        classroom: text(record.classroom),
        weeklySchedule: text(record.weeklySchedule),
        transportation: text(record.transportation),
        enrollmentStatus: text(record.enrollmentStatus),
        attendanceToday: text(record.attendanceToday),
        attendanceDate: text(record.attendanceDate),
        checkedInAt: text(record.checkedInAt),
        checkedOutAt: text(record.checkedOutAt),
        pickupPerson: text(record.pickupPerson),
        missingDocuments: strings(record.missingDocuments),
        medicalConsentStatus: text(record.medicalConsentStatus),
        nextAuditDue: audit?.nextAuditDue || "",
        fileAuditComplete: Boolean(auditState?.complete),
        immunizationStatus: shotStatus,
      };
    });

    return Response.json({
      email,
      children: safeChildren,
      careEntries,
      forms: parentForms,
    }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    });
  } catch (error) {
    return parentErrorResponse(error);
  }
}
