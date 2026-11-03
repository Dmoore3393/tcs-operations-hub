"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { hubRequest } from "@/lib/hub-request";
import ChoiceSelect from "./ChoiceSelect";

type Directory = { lanes: { id: string; full_name: string; job_title: string }[] };
// Share simultaneous selectors' requests; keep no directory cache after they resolve.
const pending = new Map<string, Promise<Directory>>();
function directory(token: string) {
  const current = pending.get(token);
  if (current) return current;
  const request = hubRequest<Directory>("/api/staff-lanes", token).finally(() => pending.delete(token));
  pending.set(token, request);
  return request;
}

export default function StaffNameSelect({ label = "Staff member", value, onChange, required = false, allowCustom = false, className, disabled }: { label?: string; value: string; onChange: (value: string) => void; required?: boolean; allowCustom?: boolean; className?: string; disabled?: boolean }) {
  const { session } = useAuth();
  const token = session?.access_token;
  const [result, setResult] = useState<{ token?: string; names: string[]; error: string }>({ names: [], error: "" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!token) return;
    let active = true;
    directory(token).then(data => { if (active) setResult({ token, names: [...new Set(data.lanes.map(person => person.full_name))].sort((a, b) => a.localeCompare(b)), error: "" }); })
      .catch(error => { if (active) setResult({ token, names: [], error: error instanceof Error ? error.message : "Could not load staff." }); });
    return () => { active = false; };
  }, [token, attempt]);
  const current = result.token === token && Boolean(token);
  return <><ChoiceSelect label={label} value={value} onChange={onChange} options={current ? result.names : []} placeholder={current ? "Choose staff member" : "Loading staff…"} required={required} allowCustom={allowCustom} className={className} disabled={disabled} />{current && result.error && <span role="alert" className="mt-2 block text-base text-red-900">{result.error} <button type="button" className="min-h-11 underline" onClick={() => setAttempt(value => value + 1)}>Try again</button></span>}</>;
}
