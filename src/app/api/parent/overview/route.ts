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

function safeParentMessages(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(-100).map((entry) => {
    const message = object(entry);
    return {
      id: text(message.id),
      direction: text(message.direction) === "Family to TCS" ? "Family to TCS" : "TCS to Family",
      subject: text(message.subject),
      body: text(message.body),
      createdAt: text(message.createdAt),
      createdBy: text(message.createdBy),
      readAt: text(message.readAt),
    };
  }).filter((message) => message.id && message.body);
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
    const organizationIds = [...new Set(children.map((child) => child.organizationId).filter(Boolean))];

    const [careResult, formsResult, transportationFeesResult] = await Promise.all([
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
      organizationIds.length
        ? admin
            .from("transportation_fee_records")
            .select("id,legacy_id,organization_id,record_data,created_at,updated_at")
            .in("organization_id", organizationIds)
            .order("updated_at", { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (careResult.error) throw careResult.error;
    if (formsResult.error) throw formsResult.error;
    if (transportationFeesResult.error) throw transportationFeesResult.error;

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

    const parentChildNames = new Set(
      children.map((child) => {
        const record = child.record;
        return `${text(record.firstName)} ${text(record.lastName)}`.trim().toLowerCase();
      }).filter(Boolean),
    );

    const transportationFees = ((transportationFeesResult.data ?? []) as unknown as DbRow[])
      .map((row) => object(row.record_data))
      .filter((record) => {
        const names = strings(record.children).map((name) => name.trim().toLowerCase());
        return names.some((name) => parentChildNames.has(name));
      })
      .map((record) => ({
        id: String(record.id ?? ""),
        weekOf: text(record.weekOf),
        familyName: text(record.familyName),
        location: text(record.location),
        expectedAmount: Number(record.expectedAmount) || 0,
        chargedAmount: Number(record.chargedAmount) || 0,
        paymentStatus: text(record.paymentStatus),
        dateCharged: text(record.dateCharged),
        datePaid: text(record.datePaid),
        children: strings(record.children),
        schools: strings(record.schools),
      }))
      .slice(0, 30);

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
        funding: text(record.subsidy) || "Not set",
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
        messages: safeParentMessages(record.familyMessages),
      };
    });

    return Response.json({
      email,
      children: safeChildren,
      careEntries,
      forms: parentForms,
      transportationFees,
    }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    });
  } catch (error) {
    return parentErrorResponse(error);
  }
}
