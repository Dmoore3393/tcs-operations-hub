export const STAFF_CONTACT_METADATA_KEY = "tcs_staff_contact";

export type StaffContactDetails = {
  first_name: string;
  last_name: string;
  phone: string;
  birthday_month: string;
  birthday_day: string;
};

export const birthdayMonths = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function validBirthday(month: unknown, day: unknown) {
  if (!/^(\d{1,2})$/.test(String(month)) || !/^(\d{1,2})$/.test(String(day))) return false;
  const m = Number(month);
  const d = Number(day);
  // A leap year keeps February 29 available without collecting a birth year.
  return Number.isInteger(m) && Number.isInteger(d) && m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(2000, m, 0)).getUTCDate();
}

export function readStaffContact(metadata: unknown, fullName = ""): StaffContactDetails {
  const saved = object(object(metadata)[STAFF_CONTACT_METADATA_KEY]);
  const [first = "", ...last] = fullName.trim().split(/\s+/);
  const hasBirthday = validBirthday(saved.birthday_month, saved.birthday_day);
  return {
    first_name: text(saved.first_name) || first,
    last_name: text(saved.last_name) || last.join(" "),
    phone: text(saved.phone),
    birthday_month: hasBirthday ? String(Number(saved.birthday_month)) : "",
    birthday_day: hasBirthday ? String(Number(saved.birthday_day)) : "",
  };
}

export function validateStaffContact(value: unknown, required = true): { contact: StaffContactDetails; error?: never } | { error: string; contact?: never } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "Enter the staff contact details." };
  const raw = object(value);
  const contact: StaffContactDetails = {
    first_name: text(raw.first_name),
    last_name: text(raw.last_name),
    phone: text(raw.phone),
    birthday_month: raw.birthday_month == null ? "" : String(raw.birthday_month).trim(),
    birthday_day: raw.birthday_day == null ? "" : String(raw.birthday_day).trim(),
  };

  for (const [key, label] of [["first_name", "First name"], ["last_name", "Last name"]] as const) {
    if (required && !contact[key]) return { error: `${label} is required.` };
    if ((raw[key] != null && typeof raw[key] !== "string") || contact[key].length > 100) return { error: `${label} must be text of 100 characters or fewer.` };
  }

  if (required && !contact.phone) return { error: "Phone number is required." };
  const digits = contact.phone.replace(/\D/g, "");
  const validPhone = contact.phone.startsWith("+") ? digits.length >= 8 && digits.length <= 15 : digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
  if ((raw.phone != null && typeof raw.phone !== "string") || (contact.phone && (!/^\+?[\d\s().-]+$/.test(contact.phone) || !validPhone || contact.phone.length > 40))) {
    return { error: "Enter a valid phone number, including the area code. For an international number, start with + and the country code." };
  }

  if (contact.birthday_month || contact.birthday_day) {
    if (!validBirthday(contact.birthday_month, contact.birthday_day)) return { error: "Choose a valid birthday month and day, or leave both blank." };
    contact.birthday_month = String(Number(contact.birthday_month));
    contact.birthday_day = String(Number(contact.birthday_day));
  }
  return { contact };
}

export function birthdayMonthNow(now = new Date()) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "numeric" }).format(now));
}

export function formatBirthday(month: number, day: number) {
  return validBirthday(month, day) ? `${birthdayMonths[month - 1]} ${day}` : "";
}

export type BirthdayEntry = { id: string; name: string; month: number; day: number };

export function birthdaysInMonth(entries: BirthdayEntry[], month: number) {
  return entries.filter((entry) => entry.month === month && validBirthday(entry.month, entry.day))
    .sort((a, b) => a.day - b.day || a.name.localeCompare(b.name));
}
