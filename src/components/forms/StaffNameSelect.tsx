"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { hubRequest } from "@/lib/hub-request";
import ChoiceSelect from "./ChoiceSelect";

type DirectoryPerson = { id: string; full_name: string; job_title: string; primary_location: string | null };
type Directory = { lanes: DirectoryPerson[] };
// Share simultaneous selectors' requests; keep no directory cache after they resolve.
const pending = new Map<string, Promise<Directory>>();
function directory(token: string) {
  const current = pending.get(token);
  if (current) return current;
  const request = hubRequest<Directory>("/api/staff-lanes", token).finally(() => pending.delete(token));
  pending.set(token, request);
  return request;
}

type StaffNameSelectProps = {
  label?: string;
  value: string;
  valueBy?: "name" | "id";
  onChange: (value: string, person?: DirectoryPerson) => void;
  required?: boolean;
  allowCustom?: boolean;
  className?: string;
  disabled?: boolean;
};

export default function StaffNameSelect({ label = "Staff member", value, valueBy = "name", onChange, required = false, allowCustom = false, className, disabled }: StaffNameSelectProps) {
  const { session } = useAuth();
  const token = session?.access_token;
  const [result, setResult] = useState<{ token?: string; people: DirectoryPerson[]; error: string }>({ people: [], error: "" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!token) return;
    let active = true;
    directory(token).then(data => { if (active) setResult({ token, people: [...data.lanes].sort((a, b) => a.full_name.localeCompare(b.full_name)), error: "" }); })
      .catch(error => { if (active) setResult({ token, people: [], error: error instanceof Error ? error.message : "Could not load staff." }); });
    return () => { active = false; };
  }, [token, attempt]);
  const current = result.token === token && Boolean(token);
  const people = current ? result.people : [];
  const options = people.map((person, index) => {
    if (valueBy === "name") return person.full_name;
    const sameName = people[index - 1]?.full_name === person.full_name || people[index + 1]?.full_name === person.full_name;
    const label = sameName ? [person.full_name, person.job_title, person.primary_location].filter(Boolean).join(" · ") : person.full_name;
    return { value: person.id, label };
  });
  return <><ChoiceSelect label={label} value={value} onChange={next => onChange(next, valueBy === "id" ? people.find(person => person.id === next) : undefined)} options={options} placeholder={current ? "Choose staff member" : "Loading staff…"} required={required} allowCustom={allowCustom} className={className} disabled={disabled} />{current && result.error && <span role="alert" className="mt-2 block text-base text-red-900">{result.error} <button type="button" className="min-h-11 underline" onClick={() => setAttempt(value => value + 1)}>Try again</button></span>}</>;
}
