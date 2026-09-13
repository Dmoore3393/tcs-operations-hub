export type ImmunizationProgram = "Child Care / Pre-K" | "TK/K-12";
export type SchoolCheckpoint = "TK/K-12 Admission / Transfer" | "7th Grade Advancement";
export type MedicalExemptionType = "None" | "Permanent" | "Temporary";
export type ImmunizationEntryStatus = "Requirements Met" | "Needs Doses / Record" | "Conditional" | "Medical Exemption" | "Needs Review";

export type ImmunizationRecord = {
  program: ImmunizationProgram;
  schoolCheckpoint: SchoolCheckpoint;
  grade: string;
  recordSource: string;
  verifiedAt: string;
  verifiedBy: string;
  polioDates: string[];
  dtapDates: string[];
  tdDates: string[];
  tdapDates: string[];
  hepBDates: string[];
  hibDates: string[];
  mmrDates: string[];
  varicellaDates: string[];
  medicalExemptionType: MedicalExemptionType;
  medicalExemptionExpiresAt: string;
  conditionalAdmission: boolean;
  conditionalReviewDue: string;
  notes: string;
  updatedAt: string;
};

export type ImmunizationRequirement = {
  key: string;
  label: string;
  required: number;
  received: number;
  met: boolean;
  note?: string;
};

function localDate(value: string) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthsOld(dateOfBirth: string, asOf = new Date()) {
  const birth = localDate(dateOfBirth);
  if (!birth || birth > asOf) return null;
  let months = (asOf.getFullYear() - birth.getFullYear()) * 12 + (asOf.getMonth() - birth.getMonth());
  if (asOf.getDate() < birth.getDate()) months -= 1;
  return Math.max(0, months);
}

function birthday(dateOfBirth: string, years: number) {
  const birth = localDate(dateOfBirth);
  if (!birth) return null;
  return new Date(birth.getFullYear() + years, birth.getMonth(), birth.getDate());
}

function countOnOrAfter(dates: string[], threshold: Date | null) {
  if (!threshold) return 0;
  return dates.filter((value) => {
    const date = localDate(value);
    return Boolean(date && date >= threshold);
  }).length;
}

function sortedUniqueDates(values: string[] | undefined) {
  return [...new Set((values ?? []).filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)))].sort();
}

export function createBlankImmunizationRecord(
  program: ImmunizationProgram = "Child Care / Pre-K",
): ImmunizationRecord {
  return {
    program,
    schoolCheckpoint: "TK/K-12 Admission / Transfer",
    grade: "",
    recordSource: "",
    verifiedAt: "",
    verifiedBy: "",
    polioDates: [],
    dtapDates: [],
    tdDates: [],
    tdapDates: [],
    hepBDates: [],
    hibDates: [],
    mmrDates: [],
    varicellaDates: [],
    medicalExemptionType: "None",
    medicalExemptionExpiresAt: "",
    conditionalAdmission: false,
    conditionalReviewDue: "",
    notes: "",
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeImmunizationRecord(
  value: Partial<ImmunizationRecord> | null | undefined,
  defaultProgram: ImmunizationProgram,
): ImmunizationRecord {
  const blank = createBlankImmunizationRecord(defaultProgram);
  return {
    ...blank,
    ...value,
    program: value?.program === "TK/K-12" ? "TK/K-12" : defaultProgram,
    schoolCheckpoint: value?.schoolCheckpoint === "7th Grade Advancement"
      ? "7th Grade Advancement"
      : "TK/K-12 Admission / Transfer",
    medicalExemptionType: value?.medicalExemptionType === "Permanent" || value?.medicalExemptionType === "Temporary"
      ? value.medicalExemptionType
      : "None",
    polioDates: sortedUniqueDates(value?.polioDates),
    dtapDates: sortedUniqueDates(value?.dtapDates),
    tdDates: sortedUniqueDates(value?.tdDates),
    tdapDates: sortedUniqueDates(value?.tdapDates),
    hepBDates: sortedUniqueDates(value?.hepBDates),
    hibDates: sortedUniqueDates(value?.hibDates),
    mmrDates: sortedUniqueDates(value?.mmrDates),
    varicellaDates: sortedUniqueDates(value?.varicellaDates),
    conditionalAdmission: Boolean(value?.conditionalAdmission),
    updatedAt: value?.updatedAt || blank.updatedAt,
  };
}

export function defaultImmunizationProgram(ageGroup: string, location: string): ImmunizationProgram {
  const source = `${ageGroup} ${location}`.toLowerCase();
  return source.includes("school age") || source.includes("division") ? "TK/K-12" : "Child Care / Pre-K";
}

function childCareRequirements(dateOfBirth: string, record: ImmunizationRecord): ImmunizationRequirement[] {
  const months = monthsOld(dateOfBirth);
  if (months === null) return [];

  let polio = 0;
  let dtap = 0;
  let hepB = 0;
  let hib = 0;
  let mmr = 0;
  let varicella = 0;

  if (months >= 2 && months <= 3) {
    polio = 1; dtap = 1; hepB = 1; hib = 1;
  } else if (months >= 4 && months <= 5) {
    polio = 2; dtap = 2; hepB = 2; hib = 2;
  } else if (months >= 6 && months <= 14) {
    polio = 2; dtap = 3; hepB = 2; hib = 2;
  } else if (months >= 15 && months <= 17) {
    polio = 3; dtap = 3; hepB = 2; hib = 1; mmr = 1; varicella = 1;
  } else if (months >= 18 && months < 72) {
    polio = 3; dtap = 4; hepB = 3; hib = 1; mmr = 1; varicella = 1;
  }

  const firstBirthday = birthday(dateOfBirth, 1);
  const hibAfterOne = countOnOrAfter(record.hibDates, firstBirthday);
  const mmrAfterOne = countOnOrAfter(record.mmrDates, firstBirthday);
  const varicellaAfterOne = countOnOrAfter(record.varicellaDates, firstBirthday);

  return [
    { key: "polio", label: "Polio", required: polio, received: record.polioDates.length, met: record.polioDates.length >= polio },
    { key: "dtap", label: "DTaP", required: dtap, received: record.dtapDates.length, met: record.dtapDates.length >= dtap },
    { key: "hepb", label: "Hepatitis B", required: hepB, received: record.hepBDates.length, met: record.hepBDates.length >= hepB },
    {
      key: "hib",
      label: "Hib",
      required: hib,
      received: months >= 15 ? hibAfterOne : record.hibDates.length,
      met: hib === 0 || (months >= 15 ? hibAfterOne >= 1 : record.hibDates.length >= hib),
      note: months >= 15 ? "For age 15 months and older, one Hib dose must be on or after the 1st birthday." : undefined,
    },
    {
      key: "mmr",
      label: "MMR",
      required: mmr,
      received: mmrAfterOne,
      met: mmr === 0 || mmrAfterOne >= mmr,
      note: mmr ? "Required dose must be on or after the 1st birthday." : undefined,
    },
    {
      key: "varicella",
      label: "Varicella",
      required: varicella,
      received: varicellaAfterOne,
      met: varicella === 0 || varicellaAfterOne >= varicella,
      note: varicella ? "California child-care entry requirement for this age checkpoint." : undefined,
    },
  ].filter((item) => item.required > 0);
}

function schoolRequirements(dateOfBirth: string, record: ImmunizationRecord): ImmunizationRequirement[] {
  if (record.schoolCheckpoint === "7th Grade Advancement") {
    const seventhBirthday = birthday(dateOfBirth, 7);
    const tdapAfterSeven = countOnOrAfter(record.tdapDates, seventhBirthday);
    return [{
      key: "tdap7",
      label: "Tdap",
      required: 1,
      received: tdapAfterSeven,
      met: tdapAfterSeven >= 1,
      note: "7th-grade advancement requires one Tdap dose; CDPH notes the booster is usually given at age 11 or older.",
    }];
  }

  const fourthBirthday = birthday(dateOfBirth, 4);
  const seventhBirthday = birthday(dateOfBirth, 7);
  const tetanusSeries = [...record.dtapDates, ...record.tdDates, ...record.tdapDates].sort();
  const tetanusAfterFour = countOnOrAfter(tetanusSeries, fourthBirthday);
  const pertussisAfterSeven = countOnOrAfter([...record.dtapDates, ...record.tdapDates], seventhBirthday);
  const tetanusAfterSeven = countOnOrAfter(tetanusSeries, seventhBirthday);
  const polioAfterFour = countOnOrAfter(record.polioDates, fourthBirthday);
  const mmrAfterOne = countOnOrAfter(record.mmrDates, birthday(dateOfBirth, 1));
  const varicellaCount = record.varicellaDates.length;
  const gradeSeven = record.grade.trim().toLowerCase().replace(/(th|grade|\s)/g, "") === "7";

  const tetanusRequired = tetanusAfterSeven >= 1 ? 3 : tetanusAfterFour >= 1 ? 4 : 5;
  const polioRequired = polioAfterFour >= 1 ? 3 : 4;
  const hepBRequired = gradeSeven ? 0 : 3;

  const requirements: ImmunizationRequirement[] = [
    {
      key: "dtap-school",
      label: "DTaP / DTP / Tdap / Td",
      required: tetanusRequired,
      received: tetanusSeries.length,
      met: tetanusSeries.length >= tetanusRequired && (record.grade && Number(record.grade.replace(/\D/g, "")) >= 7 ? pertussisAfterSeven >= 1 : true),
      note: "5 doses normally; 4 are acceptable if one was given on/after the 4th birthday; 3 are acceptable if one was given on/after the 7th birthday. For grades 7–12, at least one pertussis-containing dose (DTaP/DTP/Tdap) must be on/after the 7th birthday.",
    },
    {
      key: "polio-school",
      label: "Polio",
      required: polioRequired,
      received: record.polioDates.length,
      met: record.polioDates.length >= polioRequired,
      note: "4 doses normally; 3 are acceptable if one was given on/after the 4th birthday. Enter only valid IPV/OPV doses from the verified record.",
    },
    {
      key: "mmr-school",
      label: "MMR",
      required: 2,
      received: mmrAfterOne,
      met: mmrAfterOne >= 2,
      note: "Both required doses must be on or after the 1st birthday.",
    },
    {
      key: "varicella-school",
      label: "Varicella",
      required: 2,
      received: varicellaCount,
      met: varicellaCount >= 2,
    },
  ];

  if (hepBRequired) {
    requirements.splice(2, 0, {
      key: "hepb-school",
      label: "Hepatitis B",
      required: 3,
      received: record.hepBDates.length,
      met: record.hepBDates.length >= 3,
      note: "Required at admission to any grade except direct admission to 7th grade.",
    });
  }

  return requirements;
}

export function immunizationRequirements(dateOfBirth: string, record: ImmunizationRecord) {
  return record.program === "Child Care / Pre-K"
    ? childCareRequirements(dateOfBirth, record)
    : schoolRequirements(dateOfBirth, record);
}

export function immunizationStatus(dateOfBirth: string, record: ImmunizationRecord): ImmunizationEntryStatus {
  if (record.medicalExemptionType !== "None") return "Medical Exemption";
  if (record.conditionalAdmission) return "Conditional";
  const requirements = immunizationRequirements(dateOfBirth, record);
  if (!dateOfBirth || requirements.length === 0) return "Needs Review";
  return requirements.every((item) => item.met) ? "Requirements Met" : "Needs Doses / Record";
}

export function nextThirtyDayReview(from = new Date()) {
  const date = new Date(from);
  date.setDate(date.getDate() + 30);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
