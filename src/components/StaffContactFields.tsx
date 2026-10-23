"use client";

import { birthdayMonths, type StaffContactDetails } from "@/lib/staff-contact";

const fieldClass = "w-full min-h-12 rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 disabled:bg-slate-100";
const labelClass = "mb-1.5 block text-sm font-bold text-slate-700";

export default function StaffContactFields({ value, onChange, email, required = true, disabled = false }: {
  value: StaffContactDetails;
  onChange: (value: StaffContactDetails) => void;
  email: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const days = value.birthday_month ? new Date(Date.UTC(2000, Number(value.birthday_month), 0)).getUTCDate() : 31;
  return <fieldset disabled={disabled} className="space-y-4">
    <legend className="sr-only">Staff contact details</legend>
    <div className="grid gap-4 sm:grid-cols-2">
      <label><span className={labelClass}>First name{required ? " *" : ""}</span><input required={required} maxLength={100} autoComplete="given-name" className={fieldClass} value={value.first_name} onChange={(event) => onChange({ ...value, first_name: event.target.value })} /></label>
      <label><span className={labelClass}>Last name{required ? " *" : ""}</span><input required={required} maxLength={100} autoComplete="family-name" className={fieldClass} value={value.last_name} onChange={(event) => onChange({ ...value, last_name: event.target.value })} /></label>
    </div>
    <label className="block"><span className={labelClass}>Email address *</span><input required type="email" readOnly autoComplete="email" className={`${fieldClass} bg-slate-50`} value={email} /><span className="mt-1 block text-xs leading-5 text-slate-500">Your email is the address used for your Hub invitation.</span></label>
    <label className="block"><span className={labelClass}>Phone number{required ? " *" : ""}</span><input required={required} type="tel" autoComplete="tel" maxLength={40} className={fieldClass} value={value.phone} onChange={(event) => onChange({ ...value, phone: event.target.value })} placeholder="(661) 555-0123" /></label>
    <fieldset>
      <legend className={labelClass}>Birthday (optional)</legend>
      <div className="grid grid-cols-2 gap-3">
        <label><span className="sr-only">Birthday month</span><select autoComplete="bday-month" className={fieldClass} value={value.birthday_month} onChange={(event) => {
          const month = event.target.value;
          const maxDay = month ? new Date(Date.UTC(2000, Number(month), 0)).getUTCDate() : 0;
          onChange({ ...value, birthday_month: month, birthday_day: Number(value.birthday_day) <= maxDay && month ? value.birthday_day : "" });
        }}><option value="">Month</option>{birthdayMonths.map((month, index) => <option key={month} value={String(index + 1)}>{month}</option>)}</select></label>
        <label><span className="sr-only">Birthday day</span><select autoComplete="bday-day" className={fieldClass} disabled={!value.birthday_month || disabled} value={value.birthday_day} onChange={(event) => onChange({ ...value, birthday_day: event.target.value })}><option value="">Day</option>{Array.from({ length: days }, (_, index) => <option key={index + 1} value={String(index + 1)}>{index + 1}</option>)}</select></label>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">Add a month and day so we can celebrate with the team. No birth year needed. You can skip this and an admin can add it later.</p>
      {(value.birthday_month || value.birthday_day) && <button type="button" onClick={() => onChange({ ...value, birthday_month: "", birthday_day: "" })} className="mt-2 text-xs font-bold text-emerald-800 underline">Clear birthday</button>}
    </fieldset>
  </fieldset>;
}
