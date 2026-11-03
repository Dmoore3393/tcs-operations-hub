"use client";

import { usePersistentState } from "@/hooks/usePersistentState";
import { starterSchools } from "@/lib/hub-data";
import ChoiceSelect from "./ChoiceSelect";

export default function SchoolNameSelect({ value, onChange, allowCustom = false, className }: { value: string; onChange: (value: string) => void; allowCustom?: boolean; className?: string }) {
  const [schools, , ready, state] = usePersistentState("tcs-schools-v2", starterSchools);
  return <><ChoiceSelect label="School" value={value} onChange={onChange} options={schools.filter(school => school.status === "Active").map(school => school.school).sort((a, b) => a.localeCompare(b))} placeholder={ready ? "Choose school (optional)" : "Loading schools…"} allowCustom={allowCustom} className={className} />{state.error && <span role="alert" className="mt-2 block text-base text-red-900">{state.error} <button type="button" className="min-h-11 underline" onClick={state.retry}>Try again</button></span>}</>;
}
