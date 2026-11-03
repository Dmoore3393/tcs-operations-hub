export const KIDKARE_CLAIM_DOCUMENT = "KidKare Claim Confirmation";
export const KIDKARE_SCREENSHOT_LIMIT = 4 * 1024 * 1024;
export const KIDKARE_SCREENSHOT_TYPES = ["image/png", "image/jpeg", "image/heic", "image/heif"];
export type KidKareDayStatus = "Submitted" | "Closed / no care" | "Not submitted";
export type KidKareHome = { id: string; slug: string; name: string; full_name: string; is_active: boolean };
export type KidKareDay = {
  id: string; location_id: string; service_date: string; status: KidKareDayStatus;
  revision: number; updated_by_name: string; updated_at: string;
};
export type KidKareProof = {
  id: string; location_id: string; original_filename: string; created_at: string; source_reference: string;
};
export type KidKareSubmissionData = { homes: KidKareHome[]; days: KidKareDay[]; proofs: KidKareProof[]; today: string };

export function kidKareToday(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function validClaimMonth(value: unknown): value is string {
  return typeof value === "string" && /^20\d{2}-(0[1-9]|1[0-2])$/.test(value);
}

export function weekdaysInMonth(month: string) {
  if (!validClaimMonth(month)) return [];
  const [year, number] = month.split("-").map(Number);
  const days: string[] = [];
  const end = new Date(Date.UTC(year, number, 0)).getUTCDate();
  for (let day = 1; day <= end; day++) {
    const date = new Date(Date.UTC(year, number - 1, day));
    if (date.getUTCDay() > 0 && date.getUTCDay() < 6) days.push(`${month}-${String(day).padStart(2, "0")}`);
  }
  return days;
}

export function validKidKareDay(value: unknown): value is string {
  return typeof value === "string" && /^20\d{2}-\d{2}-\d{2}$/.test(value) && weekdaysInMonth(value.slice(0, 7)).includes(value);
}

export function monthEnd(month: string) {
  const [year, number] = month.split("-").map(Number);
  return `${month}-${String(new Date(Date.UTC(year, number, 0)).getUTCDate()).padStart(2, "0")}`;
}

export function kidKareProgress(days: KidKareDay[], month: string, today: string) {
  const elapsed = weekdaysInMonth(month).filter(day => day <= today);
  return {
    submitted: elapsed.filter(date => days.some(day => day.service_date === date && day.status === "Submitted")).length,
    closed: elapsed.filter(date => days.some(day => day.service_date === date && day.status === "Closed / no care")).length,
    unmarked: elapsed.filter(date => !days.some(day => day.service_date === date && day.status !== "Not submitted")).length,
  };
}

/** Check the bytes as well as the browser-supplied MIME type. */
export function isKidKareScreenshot(bytes: Uint8Array, type: string) {
  if (type === "image/png") return [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  if (type === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === "image/heic" || type === "image/heif") {
    const header = String.fromCharCode(...bytes.slice(4, 40));
    return header.startsWith("ftyp") && /heic|heix|hevc|hevx|mif1|msf1/.test(header);
  }
  return false;
}
