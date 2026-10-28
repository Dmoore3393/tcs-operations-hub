import { createHash } from "node:crypto";
import { importedEnrollmentStatus, normalizedBirthDate, normalizedChildName, resolveImportIdentity, repeatedImportRows } from "@/lib/brightwheel-identity";
import { tcsLocationSlug } from "@/lib/server/location-slug";
import {
  deriveChildAgeProfile,
  fundingSources,
  locations as childLocationOptions,
} from "@/lib/children";
import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";
import { isTehachapiLocation, locationDisplayName, TEHACHAPI_LOCATION_NAME } from "@/lib/location-config";

export const runtime = "nodejs";

type DbRow = Record<string, unknown>;
type CsvRow = Record<string, string>;
type ImportOverride = {
  rowKey?: string;
  include?: boolean;
  location?: string;
  funding?: string;
  matchId?: string;
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

const parseDate = normalizedBirthDate;

function canonicalLocation(value: string) {
  const source = value.toLowerCase();
  if (/halcom|moore family/.test(source)) return "Moore Family Childcare • Halcom";
  if (/21st|cathers/.test(source)) return "Cathers Family Childcare • 21st Street";
  if (/division|school age|astor/.test(source)) return "The School Age Center • Division";
  if (/33rd|cornejo/.test(source)) return "Cornejo Family Childcare • 33rd Street";
  if (/42nd|lara/.test(source)) return "Lara Family Childcare • 42nd Street";
  if (isTehachapiLocation(source)) return TEHACHAPI_LOCATION_NAME;
  return "";
}

function locationSlug(value: string) {
  const source = value.toLowerCase();
  if (/halcom|moore family/.test(source)) return "halcom";
  if (/21st|cathers/.test(source)) return "21st-street";
  if (/division|school age|astor/.test(source)) return "division";
  if (/33rd|cornejo/.test(source)) return "33rd-street";
  if (/42nd|lara/.test(source)) return "42nd-street";
  if (isTehachapiLocation(source)) return "tehachapi";
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

const enrollmentStatus = importedEnrollmentStatus;

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

  return {
    rowKey: `bw-row-${index + 2}`,
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

const normalizedName = normalizedChildName;

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
  const canonical = locationDisplayName(value);
  return (childLocationOptions as readonly string[]).includes(canonical) ? canonical : "";
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

    const locationsResult = await admin.from("locations").select("id,slug,name,full_name").eq("organization_id", profile.organization_id).eq("is_active", true);
    if (locationsResult.error) throw locationsResult.error;
    const assignedSlugs = new Set<string | null>(profile.locations.map(tcsLocationSlug).filter(Boolean));
    const liveLocations = ((locationsResult.data ?? []) as unknown as DbRow[]).filter(row => isOwner || assignedSlugs.has(text(row.slug)));
    const allowedIds = liveLocations.map(row=>text(row.id));
    if (!allowedIds.length) throw new Response("No active TCS location is assigned to this account.", { status: 403 });
    const locationIdBySlug = new Map(liveLocations.map(row => [text(row.slug), text(row.id)]));
    const existingRows: DbRow[] = [];
    for (let offset=0; ; offset+=1000) {
      const existingResult = await admin.from("children").select("id,legacy_id,location_id,first_name,last_name,date_of_birth,guardian_name,record_data,updated_at").eq("organization_id", profile.organization_id).in("location_id", allowedIds).order("id").range(offset,offset+999);
      if (existingResult.error) throw existingResult.error;
      const page = (existingResult.data ?? []) as unknown as DbRow[];
      existingRows.push(...page);
      if (page.length < 1000) break;
      if (existingRows.length >= 10000) throw new Response("This roster needs a smaller location scope. Contact TCS support before importing.", {status:413});
    }
    const snapshot = existingRows.map(row=>({id:text(row.id),updatedAt:text(row.updated_at)})).sort((a,b)=>a.id.localeCompare(b.id));
    const previewToken = createHash("sha256").update(JSON.stringify({csvText,snapshot,allowedIds:allowedIds.sort()})).digest("hex");
    if (mode === "commit" && text(body.previewToken) !== previewToken) throw new Response("Children or location access changed since this preview. Refresh Preview before importing. Nothing was saved.", {status:409});
    const sources = rows.map(childSource).filter(source => !activeOnly || source.enrollmentStatus === "Active" || source.enrollmentStatus === "Needs review");
    if (sources.length > 1000) throw new Response("Import up to 1,000 children at a time. Export a smaller roster and try again.", {status:413});
    const identities = sources.map(source=>resolveImportIdentity(source,existingRows,text(overrides.get(source.rowKey)?.matchId)));
    const repeats = repeatedImportRows(sources,identities.map(identity=>identity.existingRowId));

    const preview = sources.map((source, index) => {
      const override = overrides.get(source.rowKey);
      const selectedLocation = safeLocation(text(override?.location)) || source.detectedLocation || defaultLocation;
      const selectedFunding = safeFunding(text(override?.funding)) || source.detectedFunding || defaultFunding;
      const identity = repeats.has(index) ? { ...identities[index], matchType: "duplicate" as const, existingRowId: "", identityWarning: "This child appears more than once in the CSV or targets the same profile twice. Keep one row and refresh the preview." } : identities[index];
      const match = existingRows.find(row=>text(row.id) === identity.existingRowId);
      const blocked = repeats.has(index) || source.enrollmentStatus === "Needs review" || !deriveChildAgeProfile(source.dateOfBirth);

      const warnings: string[] = [];
      if (!source.firstName || !source.lastName) warnings.push("Missing child name");
      if (!deriveChildAgeProfile(source.dateOfBirth)) warnings.push("Missing or invalid birth date");
      if (source.enrollmentStatus === "Needs review") warnings.push("Unrecognized enrollment status — check the CSV");
      if (identity.identityWarning) warnings.push(identity.identityWarning);
      if (selectedLocation && !locationIdBySlug.has(locationSlug(selectedLocation))) warnings.push("This location is not assigned to your account");
      if (!selectedLocation) warnings.push("Choose a TCS location");
      if (!selectedFunding) warnings.push("Choose a funding source");
      if (!source.primaryGuardian) warnings.push("Parent/guardian contact not found in export");

      return {
        ...source,
        selectedLocation,
        selectedFunding,
        ...identity,
        blocked,
        existingLegacyId: match ? text(match.legacy_id) : "",
        existingRowId: match ? text(match.id) : "",
        include: override?.include !== false && identity.matchType !== "duplicate",
        warnings,
        ready: !blocked && identity.matchType !== "review" && warnings.filter((warning) => warning !== "Parent/guardian contact not found in export").length === 0,
      };
    });

    if (mode === "preview") {
      return Response.json({
        ok: true,
        previewToken,
        rows: preview,
        totals: {
          fileRows: rows.length,
          activeRows: sources.length,
          excludedRows: rows.length - sources.length,
          newRows: preview.filter((row) => row.matchType === "new").length,
          updateRows: preview.filter((row) => row.matchType === "update").length,
          needsAttention: preview.filter((row) => !row.ready).length,
        },
        parentInvitationsEnabled: false,
        message: "Preview only. No child records or parent invitations were changed.",
      }, { headers: { "Cache-Control": "no-store" } });
    }

    const changes: DbRow[] = [];
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
        attendanceToday: text(existingRecord.attendanceToday) || "Not Scheduled",
        medicalProvider: row.doctorName || undefined,
        medicalProviderPhone: row.doctorPhone || undefined,
        emergencyContact1Name: row.emergencyName || undefined,
        emergencyContact1Phone: row.emergencyPhone || undefined,
        emergencyContact1Relationship: row.emergencyRelationship || undefined,
        weeklySchedule: text(existingRecord.weeklySchedule) || "Schedule not entered",
        transportation: text(existingRecord.transportation) || "No transportation",
        licensingStatus: text(existingRecord.licensingStatus) || "Missing Documents",
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

      changes.push({ targetId: text(matched?.id), payload });
      imported.push({rowKey:row.rowKey,childName:`${row.firstName} ${row.lastName}`.trim(),result:matched ? "Updated" : "Added"});
    }

    let inserted = 0, updated = 0;
    if (changes.length) {
      const saved = await admin.rpc("hub_import_brightwheel_roster", {p_actor:user.id,p_organization:profile.organization_id,p_snapshot:snapshot,p_rows:changes});
      if (saved.error) {
        if (saved.error.code === "40001" || saved.error.code === "55P03") throw new Response("Children changed or another save is running. Refresh Preview and try again. Nothing from this import was saved.", {status:409});
        throw saved.error;
      }
      const counts = object(saved.data); inserted = Number(counts.inserted) || 0; updated = Number(counts.updated) || 0;
    }
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
