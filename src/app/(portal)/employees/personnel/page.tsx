"use client";

import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import { hubRequest } from "@/lib/hub-request";
import { useEffect, useState } from "react";
import Link from "next/link";

type PersonnelRecord = { id: string; source_name: string; lane_id: string | null; details: Record<string, string>; staff_lane_profiles: { full_name: string; is_active: boolean; job_title: string; primary_location: string | null } | null };

export default function PersonnelPage() {
  const { session, isSystemOwner } = useAuth();
  const token = session?.access_token;
  const [records, setRecords] = useState<PersonnelRecord[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState("");
  useEffect(() => {
    if (!token || !isSystemOwner) return;
    let current = true;
    hubRequest<{ records: PersonnelRecord[] }>("/api/staff-personnel", token)
      .then(body => { if (current) { setRecords(body.records); setError(""); } })
      .catch(reason => { if (current) setError(reason instanceof Error ? reason.message : "Could not load personnel records."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [token, isSystemOwner, retry]);
  return <MainLayout><main className="mx-auto max-w-4xl space-y-5 pb-12 text-lg">
    <Link href="/employees" className="font-bold text-emerald-800 underline">Back to Employees</Link>
    <h1 className="text-3xl font-black">Private personnel records</h1>
    <p>Brightwheel staff export • November 1, 2026. Owner/Admin access only.</p>
    <p>Imported information does not change Hub permissions, job titles, reporting lines, locations, or active status. Missing staff stay in the directory. Unmatched records require identity review before linking.</p>
    {!isSystemOwner ? <p role="alert">Owner/Admin access is required.</p> : <>
      <label className="block font-bold">Find a staff record<input className="mt-2 min-h-12 w-full rounded-xl border p-3 text-lg" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name" /></label>
      {loading && <p role="status">Loading private records…</p>}
      {error && <div role="alert"><p>{error}</p><button className="mt-2 min-h-12 rounded-xl bg-emerald-800 px-5 text-white" onClick={() => { setLoading(true); setRetry(n => n + 1); }}>Try again</button></div>}
      {records.filter(row => row.source_name.toLowerCase().includes(search.trim().toLowerCase())).map(row => <details key={row.id} className="rounded-2xl border bg-white p-5">
        <summary className="min-h-11 cursor-pointer font-bold">{row.source_name} — {row.staff_lane_profiles ? row.staff_lane_profiles.is_active ? "Linked • active" : "Linked • inactive" : "Identity review needed"}</summary>
        {row.staff_lane_profiles && <p className="my-3">Hub profile: {row.staff_lane_profiles.full_name} • {row.staff_lane_profiles.job_title} • {row.staff_lane_profiles.primary_location || "Location unassigned"}</p>}
        <dl className="mt-4 space-y-4">{Object.entries(row.details).filter(([, value]) => value.trim()).map(([key, value]) => <div key={key}><dt className="font-bold text-emerald-900">{key} <span className="font-normal">(Brightwheel)</span></dt><dd className="whitespace-pre-wrap break-words">{value}</dd></div>)}</dl>
      </details>)}
      {!loading && !error && records.length === 0 && <p>No personnel records have been imported.</p>}
    </>}
  </main></MainLayout>;
}
