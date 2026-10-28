export const onboardingStages = [
  "Before start",
  "First day",
  "First week",
  "30/60/90 days",
] as const;
export type OnboardingStatus =
  | "Pending"
  | "Submitted"
  | "Verified"
  | "Not applicable";
export type OnboardingItem = {
  id: string;
  title: string;
  stage: string;
  dueDate: string;
  owner: string;
  status: OnboardingStatus;
  note: string;
  expiresOn: string;
  submittedAt: string;
  submittedBy: string;
  verifiedAt: string;
  verifiedBy: string;
};
export type OnboardingPlan = {
  id: string;
  full_name: string;
  email: string;
  job_title: string;
  location_id: string;
  staff_user_id: string | null;
  start_date: string;
  supervisor: string;
  items: OnboardingItem[];
  status: "Active" | "Archived";
  reviewed_at: string | null;
  reviewed_by: string | null;
  updated_at: string;
};
const template: Array<[string, string, number]> = [
  ["Offer, role and availability confirmed", "Before start", -1],
  ["References reviewed", "Before start", -1],
  [
    "Employment paperwork completion verified (I-9, W-4 and applicable forms)",
    "Before start",
    -1,
  ],
  [
    "Background clearance and required associations verified by leadership",
    "Before start",
    -1,
  ],
  [
    "TB / immunization documentation reviewed in the restricted employee file",
    "Before start",
    -1,
  ],
  ["CPR / First Aid proof and expiration reviewed", "Before start", -1],
  [
    "Mandated Reporter training assigned and proof reviewed",
    "Before start",
    -1,
  ],
  [
    "Food-handler training reviewed if assigned to food duties",
    "Before start",
    -1,
  ],
  ["Supervisor, first-day schedule and location confirmed", "Before start", -1],
  ["Hub invitation and assigned-location access checked", "First day", 0],
  ["Emergency contact and time-clock setup checked", "First day", 0],
  ["Active supervision, ratios and child-count orientation", "First day", 0],
  ["Calm-down area and positive guidance orientation", "First day", 0],
  [
    "Emergency, illness, incident and confidentiality procedures",
    "First day",
    0,
  ],
  ["Transportation and vehicle-sweep orientation if assigned", "First day", 0],
  ["Shadowing / buddy shifts completed", "First week", 7],
  [
    "Opening / closing and family communication routines practiced",
    "First week",
    7,
  ],
  ["Required Training Center assignments and proof checked", "First week", 7],
  ["First-week supervisor follow-up", "First week", 7],
  ["30-day employee and leadership check-in", "30/60/90 days", 30],
  ["60-day employee and leadership check-in", "30/60/90 days", 60],
  ["90-day employee and leadership check-in", "30/60/90 days", 90],
];
export function validOnboardingDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function dateAfter(start: string, days: number) {
  const date = new Date(`${start}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function newOnboardingItems(
  start: string,
  owner: string,
): OnboardingItem[] {
  if (!validOnboardingDate(start)) throw new Error("Enter a valid start date.");
  return template.map(([title, stage, days], index) => ({
    id: `step-${index + 1}`,
    title,
    stage,
    dueDate: dateAfter(start, days),
    owner,
    status: "Pending",
    note: "",
    expiresOn: "",
    submittedAt: "",
    submittedBy: "",
    verifiedAt: "",
    verifiedBy: "",
  }));
}
export function onboardingToday(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function onboardingItemComplete(item: OnboardingItem, today: string) {
  return (
    (item.status === "Verified" &&
      (!item.expiresOn || item.expiresOn >= today)) ||
    item.status === "Not applicable"
  );
}
export function onboardingSummary(items: OnboardingItem[], today: string) {
  const complete = items.filter((item) =>
    onboardingItemComplete(item, today),
  ).length;
  return {
    complete,
    total: items.length,
    submitted: items.filter((item) => item.status === "Submitted").length,
    overdue: items.filter(
      (item) => !onboardingItemComplete(item, today) && item.dueDate < today,
    ).length,
    expired: items.filter(
      (item) =>
        item.status === "Verified" && item.expiresOn && item.expiresOn < today,
    ).length,
    readyForReview: items.length > 0 && complete === items.length,
  };
}
const text = (value: unknown, max = 1000) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
export function updateOnboardingItem(
  item: OnboardingItem,
  input: Record<string, unknown>,
  canManage: boolean,
  actor: string,
  now: string,
): OnboardingItem {
  const status = text(input.status) as OnboardingStatus;
  if (!["Pending", "Submitted", "Verified", "Not applicable"].includes(status))
    throw new Error("Choose a valid checklist status.");
  if (!canManage && !["Pending", "Submitted"].includes(status))
    throw new Error("Only leadership can verify or waive a checklist item.");
  if (!canManage && ["Verified", "Not applicable"].includes(item.status))
    throw new Error("Ask leadership to reopen a verified item.");
  const dueDate = canManage
    ? text(input.dueDate) || item.dueDate
    : item.dueDate;
  const expiresOn = canManage
    ? input.expiresOn === undefined
      ? item.expiresOn
      : text(input.expiresOn)
    : item.expiresOn;
  if (
    !validOnboardingDate(dueDate) ||
    (expiresOn && !validOnboardingDate(expiresOn))
  )
    throw new Error("Enter valid checklist dates.");
  if (
    status === "Verified" &&
    expiresOn &&
    expiresOn < onboardingToday(new Date(now))
  )
    throw new Error("This proof is expired. Update it before verification.");
  const note = input.note === undefined ? item.note : text(input.note);
  if (status === "Not applicable" && !note)
    throw new Error("Explain why this item does not apply.");
  return {
    ...item,
    status,
    dueDate,
    expiresOn,
    note,
    owner: canManage ? text(input.owner, 160) || item.owner : item.owner,
    submittedAt: status === "Submitted" ? now : item.submittedAt,
    submittedBy: status === "Submitted" ? actor : item.submittedBy,
    verifiedAt: ["Verified", "Not applicable"].includes(status) ? now : "",
    verifiedBy: ["Verified", "Not applicable"].includes(status) ? actor : "",
  };
}

/** Works in HTTPS browsers and WKWebView versions without randomUUID. */
export function newOnboardingRequestId(
  provider: Pick<Crypto, "getRandomValues"> &
    Partial<Pick<Crypto, "randomUUID">> = globalThis.crypto,
) {
  if (provider.randomUUID) return provider.randomUUID();
  const bytes = provider.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
