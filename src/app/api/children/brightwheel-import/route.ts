import {
  deriveChildAgeProfile,
  fundingSources,
  locations as childLocationOptions,
} from "@/lib/children";
import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";

export const runtime = "nodejs";

type DbRow = Record<string, unknown>;
type CsvRow = Record<string, string>;
type ImportOverride = {
  rowKey?: string;
  include?: boolean;
  location?: string;
  funding?: string;
};

function object(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DbRow : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseCsv(source: string): CsvRow[] {
  const input = source.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (char === '"') {
      if (inQuotes && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some((value) => value.trim())) records.push(row);
      row = [];
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((value) => value.trim())) records.push(row);
  if (records.length < 2) return [];

  const headers = records[0].map((value, index) => value.trim() || `column_${index + 1}`);
  return records.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""])));
}

function normalizedEntries(row: CsvRow) {
  return Object.entries(row).map(([key, value]) => ({
    key: normalizeHeader(key),
    originalKey: key,
    value: value.trim(),
  }));
}

function exactValue(row: CsvRow, aliases: string[]) {
  const aliasSet = new Set(aliases.map(normalizeHeader));
  return normalizedEntries(row).find((entry) => aliasSet.has(entry.key) && entry.value)?.value ?? "";
}

function patternedValue(row: CsvRow, requiredTerms: string[], excludedTerms: string[] = []) {
  const required = requiredTerms.map(normalizeHeader);
  const excluded = excludedTerms.map(normalizeHeader);
  return normalizedEntries(row).find((entry) =>
    entry.value
    && required.every((term) => entry.key.includes(term))
    && excluded.every((term) => !entry.key.includes(term))
  )?.value ?? "";
}

function firstValue(row: CsvRow, exactAliases: string[], patterns: Array<{ required: string[]; excluded?: string[] }> = []) {
  const exact = exactValue(row, exactAliases);
  if (exact) return exact;
  for (const pattern of patterns) {
    const value = patternedValue(row, pattern.required, pattern.excluded ?? []);
    if (value) return value;
  }
  return "";
}

function parseDate(value: string) {
  const source = value.trim();
  if (!source) return "";

  const iso = source.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, year, month, day] = iso;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const us = source.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (us) {
    const [, month, day, year] = us;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(source);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function canonicalLocation(value: string) {
  const source = value.toLowerCase();
  if (/halcom|moore family/.test(source)) return "Moore Family Childcare • Halcom";
  if (/21st|cathers/.test(source)) return "Cathers Family Childcare • 21st Street";
  if (/division|school age|astor/.test(source)) return "The School Age Center • Division";
  if (/33rd|cornejo/.test(source)) return "Cornejo Family Childcare • 33rd Street";
  if (/42nd|lara/.test(source)) return "Lara Family Childcare • 42nd Street";
  if (/tehachapi/.test(source)) return "Tehachapi Transportation Hub";
  return "";
}

function locationSlug(value: string) {
  const source = value.toLowerCase();
  if (/halcom|moore family/.test(source)) return "halcom";
  if (/21st|cathers/.test(source)) return "21st-street";
  if (/division|school age|astor/.test(source)) return "division";
  if (/33rd|cornejo/.test(source)) return "33rd-street";
  if (/42nd|lara/.test(source)) return "42nd-street";
  if (/tehachapi/.test(source)) return "tehachapi";
  return "";
}

function inferFunding(value: string) {
  const source = value.toLowerCase();
  if (!source) return "";
  if (/stage\s*1/.test(source)) return "CCRC Stage 1";
  if (/stage\s*2/.test(source)) return "CCRC Stage 2";
  if (/crystal\s*stairs/.test(source)) return "Crystal Stairs";
  if (/\bcccc\b/.test(source)) return "CCCC";
  if (/\bdcfs\b/.test(source)) return "DCFS";
  if (/respite/.test(source)) return "Respite";
  if (/private|cash/.test(source)) return "Cash Pay";
  return "";
}

function enrollmentStatus(value: string) {
  const source = value.toLowerCase();
  if (!source || /active|enrolled|current/.test(source)) return "Active";
  if (/pending|prospect|wait|future/.test(source)) return "Pending";
  if (/inactive|withdraw|graduat|archiv|former/.test(source)) return "Archived";
  return "Active";
}

function childSource(row: CsvRow, index: number) {
  const firstName = firstValue(row, ["first_name", "firstname", "studentfirstname", "childfirstname"], [
    { required: ["student", "first", "name"] },
    { required: ["child", "first", "name"] },
  ]);
  const lastName = firstValue(row, ["last_name", "lastname", "studentlastname", "childlastname"], [
    { required: ["student", "last", "name"] },
    { required: ["child", "last", "name"] },
  ]);
  const brightwheelId = firstValue(row, ["brightwheel_id", "brightwheelid"], [{ required: ["brightwheel", "id"] }]);
  const studentId = firstValue(row, ["student_id", "studentid", "customid"], [{ required: ["student", "id"], excluded: ["brightwheel"] }]);
  const dateOfBirth = parseDate(firstValue(row, ["birth_date", "birthdate", "birthday", "dateofbirth"], [
    { required: ["birth", "date"] },
    { required: ["birthday"] },
  ]));
  const room = firstValue(row, ["homeroom", "room", "rooms", "roomshomeroom"], [
    { required: ["homeroom"] },
    { required: ["room"], excluded: ["bathroom"] },
  ]);
  const enrollment = firstValue(row, ["enrollment_status", "enrollmentstatus", "status"], [
    { required: ["enrollment", "status"] },
  ]);
  const primaryGuardian = firstValue(row, ["parent_name", "parentname", "parent1name", "guardianname", "primaryparent"], [
    { required: ["parent", "name"], excluded: ["2", "second"] },
    { required: ["guardian", "name"], excluded: ["2", "second"] },
  ]);
  const secondaryGuardian = firstValue(row, ["parent2name", "secondparentname", "secondaryparent"], [
    { required: ["parent", "2", "name"] },
    { required: ["second", "parent", "name"] },
  ]);
  const guardianEmail = firstValue(row, ["parent_email", "parentemail", "parent1email", "guardianemail"], [
    { required: ["parent", "email"], excluded: ["2", "second"] },
    { required: ["guardian", "email"], excluded: ["2", "second"] },
  ]);
  const guardianPhone = firstValue(row, ["parent_mobile_phone", "parentmobilephone", "parentphone", "parent1phone", "guardianphone"], [
    { required: ["parent", "phone"], excluded: ["2", "second"] },
    { required: ["parent", "mobile"], excluded: ["2", "second"] },
    { required: ["guardian", "phone"], excluded: ["2", "second"] },
  ]);
  const allergies = firstValue(row, ["allergies", "allergy"], [{ required: ["allerg"] }]);
  const medications = firstValue(row, ["medications", "medication"], [{ required: ["medication"] }]);
  const allergyMedicationCombined = firstValue(row, ["allergies_medications", "allergiesmedications"], [
    { required: ["allerg", "medication"] },
  ]);
  const doctorName = firstValue(row, ["doctor_name", "doctorname", "physicianname"], [
    { required: ["doctor", "name"] },
    { required: ["physician", "name"] },
  ]);
  const doctorPhone = firstValue(row, ["doctor_phone", "doctorphone", "physicianphone"], [
    { required: ["doctor", "phone"] },
    { required: ["physician", "phone"] },
  ]);
  const emergencyName = firstValue(row, ["emergency_contact_name", "emergencycontactname"], [
    { required: ["emergency", "contact", "name"] },
  ]);
  const emergencyPhone = firstValue(row, ["emergency_contact_phone", "emergencycontactphone"], [
    { required: ["emergency", "contact", "phone"] },
  ]);
  const emergencyRelationship = firstValue(row, ["emergency_contact_relationship", "emergencycontactrelationship"], [
    { required: ["emergency", "relationship"] },
  ]);
  const subsidy = firstValue(row, ["subsidy", "subsidy_details", "subsidydetails", "funding", "paysource"], [
    { required: ["subsid"] },
    { required: ["funding"] },
  ]);

  const keySeed = brightwheelId || studentId || `${firstName}|${lastName}|${dateOfBirth}|${index + 1}`;
  return {
    rowKey: `bw-${Buffer.from(keySeed).toString("base64url").slice(0, 48)}`,
    rowNumber: index + 2,
    brightwheelId,
    studentId,
    firstName,
    lastName,
    dateOfBirth,
    room,
    enrollmentStatus: enrollmentStatus(enrollment),
    primaryGuardian,
    secondaryGuardian,
    guardianEmail,
    guardianPhone,
    allergies: allergies || allergyMedicationCombined,
    medications: medications || (allergyMedicationCombined && !allergies ? allergyMedicationCombined : ""),
    doctorName,
    doctorPhone,
    emergencyName,
    emergencyPhone,
    emergencyRelationship,
    subsidyRaw: subsidy,
    detectedFunding: inferFunding(subsidy),
    detectedLocation: canonicalLocation(room),
  };
}

function sourceIdFromRecord(record: DbRow) {
  const brightwheel = object(record.brightwheel);
  return text(brightwheel.id) || text(record.brightwheelId);
}

function normalizedName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function mergeDefined(existing: DbRow, incoming: DbRow) {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined || value === null || value === "") continue;
    merged[key] = value;
  }
  return merged;
}

function safeFunding(value: string) {
  return (fundingSources as readonly string[]).includes(value) ? value : "";
}

function safeLocation(value: string) {
  return (childLocationOptions as readonly string[]).includes(value) ? value : "";
}

export async function POST(request: Request) {
  try {
    const { admin, user, profile, isOwner, isLicensee } = await requireStaff(request);
    if (!isOwner && !isLicensee) {
      throw new Response("Only an Owner/Admin or Location Licensee can import child rosters.", { status: 403 });
    }

    const body = object(await request.json().catch(() => ({})));
    const mode = text(body.mode) === "commit" ? "commit" : "preview";
    const csvText = text(body.csvText);
    const defaultLocation = safeLocation(text(body.defaultLocation));
    const defaultFunding = safeFunding(text(body.defaultFunding));
    const activeOnly = body.activeOnly !== false;
    const overrides = Array.isArray(body.overrides)
      ? new Map((body.overrides as ImportOverride[]).map((item) => [text(item.rowKey), item]))
      : new Map<string, ImportOverride>();

    if (!csvText) throw new Response("Choose a Brightwheel roster CSV first.", { status: 400 });
    if (csvText.length > 5_000_000) throw new Response("That roster file is too large. Export only the student roster and try again.", { status: 413 });

    const rows = parseCsv(csvText);
    if (!rows.length) throw new Response("No roster rows were found in that CSV.", { status: 400 });

    const [existingResult, locationsResult] = await Promise.all([
      admin
        .from("children")
        .select("id,legacy_id,location_id,first_name,last_name,date_of_birth,guardian_name,record_data")
        .eq("organization_id", profile.organization_id),
      admin
        .from("locations")
        .select("id,slug,name,full_name")
        .eq("organization_id", profile.organization_id)
        .eq("is_active", true),
    ]);
    if (existingResult.error) throw existingResult.error;
    if (locationsResult.error) throw locationsResult.error;

    const existingRows = (existingResult.data ?? []) as unknown as DbRow[];
    const liveLocations = (locationsResult.data ?? []) as unknown as DbRow[];
    const locationIdBySlug = new Map(liveLocations.map((row) => [text(row.slug), text(row.id)]));

    const sources = rows.map(childSource).filter((source) => !activeOnly || source.enrollmentStatus === "Active");

    const preview = sources.map((source) => {
      const override = overrides.get(source.rowKey);
      const selectedLocation = safeLocation(text(override?.location)) || source.detectedLocation || defaultLocation;
      const selectedFunding = safeFunding(text(override?.funding)) || source.detectedFunding || defaultFunding;
      const nameKey = `${normalizedName(source.firstName)}|${normalizedName(source.lastName)}|${source.dateOfBirth}`;

      const match = existingRows.find((row) => {
        const record = object(row.record_data);
        if (source.brightwheelId && sourceIdFromRecord(record) === source.brightwheelId) return true;
        const existingKey = `${normalizedName(text(row.first_name))}|${normalizedName(text(row.last_name))}|${text(row.date_of_birth)}`;
        return Boolean(source.dateOfBirth && source.firstName && source.lastName && existingKey === nameKey);
      });

      const warnings: string[] = [];
      if (!source.firstName || !source.lastName) warnings.push("Missing child name");
      if (!source.dateOfBirth) warnings.push("Missing birth date");
      if (!selectedLocation) warnings.push("Choose a TCS location");
      if (!selectedFunding) warnings.push("Choose a funding source");
      if (!source.primaryGuardian) warnings.push("Parent/guardian contact not found in export");

      return {
        ...source,
        selectedLocation,
        selectedFunding,
        matchType: match ? "update" : "new",
        existingLegacyId: match ? text(match.legacy_id) : "",
        existingRowId: match ? text(match.id) : "",
        include: override?.include !== false,
        warnings,
        ready: warnings.filter((warning) => warning !== "Parent/guardian contact not found in export").length === 0,
      };
    });

    if (mode === "preview") {
      return Response.json({
        ok: true,
        rows: preview,
        totals: {
          fileRows: rows.length,
          activeRows: sources.length,
          newRows: preview.filter((row) => row.matchType === "new").length,
          updateRows: preview.filter((row) => row.matchType === "update").length,
          needsAttention: preview.filter((row) => !row.ready).length,
        },
        parentInvitationsEnabled: false,
        message: "Preview only. No child records or parent invitations were changed.",
      }, { headers: { "Cache-Control": "no-store" } });
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const imported: Array<{ rowKey: string; childName: string; result: string }> = [];

    for (const row of preview) {
      if (!row.include || !row.ready) {
        skipped += 1;
        imported.push({ rowKey: row.rowKey, childName: `${row.firstName} ${row.lastName}`.trim() || `CSV row ${row.rowNumber}`, result: "Skipped" });
        continue;
      }

      const locationSlugValue = locationSlug(row.selectedLocation);
      const locationId = locationIdBySlug.get(locationSlugValue);
      if (!locationId) {
        skipped += 1;
        imported.push({ rowKey: row.rowKey, childName: `${row.firstName} ${row.lastName}`.trim(), result: "Skipped — location not active" });
        continue;
      }

      const matched = row.existingRowId ? existingRows.find((entry) => text(entry.id) === row.existingRowId) : undefined;
      const existingRecord = object(matched?.record_data);
      const ageProfile = deriveChildAgeProfile(row.dateOfBirth);
      if (!ageProfile) {
        skipped += 1;
        imported.push({ rowKey: row.rowKey, childName: `${row.firstName} ${row.lastName}`.trim(), result: "Skipped — invalid birth date" });
        continue;
      }

      const medicationNote = row.medications ? `Brightwheel medications: ${row.medications}` : "";
      const importedRecord: DbRow = {
        firstName: row.firstName,
        lastName: row.lastName,
        age: ageProfile.age,
        dateOfBirth: row.dateOfBirth,
        ageGroup: ageProfile.ageGroup,
        location: row.selectedLocation,
        classroom: row.room || ageProfile.classroom,
        primaryGuardian: row.primaryGuardian,
        secondaryGuardian: row.secondaryGuardian || undefined,
        phone: row.guardianPhone,
        familyName: row.lastName ? `${row.lastName} Family` : undefined,
        guardianEmail: row.guardianEmail || undefined,
        subsidy: row.selectedFunding,
        allergies: row.allergies || undefined,
        medicalNotes: medicationNote || undefined,
        enrollmentStatus: row.enrollmentStatus,
        attendanceToday: "Not Scheduled",
        medicalProvider: row.doctorName || undefined,
        medicalProviderPhone: row.doctorPhone || undefined,
        emergencyContact1Name: row.emergencyName || undefined,
        emergencyContact1Phone: row.emergencyPhone || undefined,
        emergencyContact1Relationship: row.emergencyRelationship || undefined,
        weeklySchedule: text(existingRecord.weeklySchedule) || "Schedule not entered",
        transportation: text(existingRecord.transportation) || "No transportation",
        licensingStatus: text(existingRecord.licensingStatus) || "Complete",
        familyAccess: Array.isArray(existingRecord.familyAccess) ? existingRecord.familyAccess : [],
        familyMessages: Array.isArray(existingRecord.familyMessages) ? existingRecord.familyMessages : [],
        brightwheel: {
          id: row.brightwheelId,
          studentId: row.studentId,
          room: row.room,
          source: "Brightwheel roster CSV",
          importedAt: new Date().toISOString(),
        },
      };

      const recordData = mergeDefined(existingRecord, importedRecord);
      // The importer stores guardian contact details only. It never grants Parent Portal access.
      recordData.familyAccess = Array.isArray(existingRecord.familyAccess) ? existingRecord.familyAccess : [];
      recordData.familyMessages = Array.isArray(existingRecord.familyMessages) ? existingRecord.familyMessages : [];
      if (text(existingRecord.pickupPinDigest)) recordData.pickupPinDigest = text(existingRecord.pickupPinDigest);
      if (text(existingRecord.pickupPinUpdatedAt)) recordData.pickupPinUpdatedAt = text(existingRecord.pickupPinUpdatedAt);

      const legacyId = matched
        ? text(matched.legacy_id)
        : row.brightwheelId
          ? `brightwheel:${row.brightwheelId}`
          : `brightwheel:${normalizedName(row.firstName)}-${normalizedName(row.lastName)}-${row.dateOfBirth}`;

      const payload = {
        organization_id: profile.organization_id,
        location_id: locationId,
        legacy_id: legacyId,
        first_name: row.firstName,
        last_name: row.lastName,
        date_of_birth: row.dateOfBirth,
        age_group: ageProfile.ageGroup,
        enrollment_status: row.enrollmentStatus,
        attendance_status: text(existingRecord.attendanceToday) || "Not Scheduled",
        guardian_name: row.primaryGuardian || text(matched?.guardian_name) || null,
        record_data: recordData,
        updated_by: user.id,
      };

      if (matched?.id) {
        const save = await admin.from("children").update(payload).eq("id", text(matched.id));
        if (save.error) throw save.error;
        updated += 1;
        imported.push({ rowKey: row.rowKey, childName: `${row.firstName} ${row.lastName}`.trim(), result: "Updated" });
      } else {
        const save = await admin.from("children").insert({ ...payload, created_by: user.id });
        if (save.error) throw save.error;
        inserted += 1;
        imported.push({ rowKey: row.rowKey, childName: `${row.firstName} ${row.lastName}`.trim(), result: "Added" });
      }
    }

    await admin.from("audit_log").insert({
      organization_id: profile.organization_id,
      actor_user_id: user.id,
      action: "INSERT",
      table_name: "children",
      row_id: null,
      metadata: {
        kind: "brightwheel_roster_import",
        inserted,
        updated,
        skipped,
        parentInvitationsSent: 0,
      },
    });

    return Response.json({
      ok: true,
      inserted,
      updated,
      skipped,
      results: imported,
      parentInvitationsSent: 0,
      message: `Brightwheel import complete: ${inserted} added, ${updated} updated, ${skipped} skipped. No Parent Portal invitations were sent.`,
    });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
