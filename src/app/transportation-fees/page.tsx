"use client";

import MainLayout from "@/components/layout/MainLayout";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { Modal, PageIntro, PrimaryButton, SecondaryButton, SectionCard, StatCard, StatusBadge, inputClass } from "@/components/hub/HubUI";
import { usePersistentState } from "@/hooks/usePersistentState";
import { initialChildren, type ChildRecord } from "@/lib/children";
import { starterRoutes, type TransportationRoute } from "@/lib/hub-data";
import {
  TRANSPORTATION_WEEKLY_FEE,
  buildTransportationFeeExpectations,
  mondayOfWeek,
  starterTransportationFees,
  transportationChargeStatus,
  type TransportationFeeRecord,
  type TransportationPaymentStatus,
} from "@/lib/admin-ops";
import { Bus, CheckCircle2, CircleDollarSign, RefreshCw, Search, TriangleAlert } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function statusTone(status: ReturnType<typeof transportationChargeStatus>) {
  if (status === "Correct" || status === "Resolved") return "green" as const;
  if (status === "Needs Charge") return "red" as const;
  return "amber" as const;
}

export default function TransportationFeesPage() {
  const { location } = useHubLocation();
  const [children] = usePersistentState<ChildRecord[]>("tcs-children-v1", initialChildren);
  const [routes] = usePersistentState<TransportationRoute[]>("tcs-routes", starterRoutes);
  const [records, setRecords] = usePersistentState<TransportationFeeRecord[]>("tcs-transportation-fees-v1", starterTransportationFees);
  const [weekOf, setWeekOf] = useState(mondayOfWeek());
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<TransportationFeeRecord | null>(null);

  const expectations = useMemo(() => buildTransportationFeeExpectations(children, routes), [children, routes]);

  const visibleRecords = useMemo(() => records
    .filter((record) => record.weekOf === weekOf)
    .filter((record) => location === "All Locations" || record.location === location)
    .filter((record) => {
      const query = search.trim().toLowerCase();
      return !query || [record.familyName, record.guardianName, record.children.join(" "), record.schools.join(" ")].join(" ").toLowerCase().includes(query);
    })
    .sort((a, b) => a.familyName.localeCompare(b.familyName)), [location, records, search, weekOf]);

  const expectedForView = expectations.filter((item) => location === "All Locations" || item.location === location);
  const expectedTotal = visibleRecords.reduce((sum, item) => sum + item.expectedAmount, 0);
  const chargedTotal = visibleRecords.reduce((sum, item) => sum + item.chargedAmount, 0);
  const needsAttention = visibleRecords.filter((item) => !["Correct", "Resolved"].includes(transportationChargeStatus(item))).length;
  const unpaid = visibleRecords.filter((item) => item.paymentStatus === "Unpaid" && item.expectedAmount > 0).length;

  function syncWeek() {
    setRecords((current) => {
      const currentByKey = new Map(current.map((item) => [`${item.weekOf}|${item.location}|${item.familyKey}`, item]));
      const synced = expectations.map((expected) => {
        const key = `${weekOf}|${expected.location}|${expected.familyKey}`;
        const existing = currentByKey.get(key);
        if (existing) {
          return {
            ...existing,
            familyName: expected.familyName,
            guardianName: expected.guardianName,
            children: expected.children,
            schools: expected.schools,
            expectedAmount: expected.expectedAmount,
            notes: existing.notes || expected.reviewNote,
          };
        }
        return {
          id: Date.now() + Math.floor(Math.random() * 100000),
          location: expected.location,
          weekOf,
          familyKey: expected.familyKey,
          familyName: expected.familyName,
          guardianName: expected.guardianName,
          children: expected.children,
          schools: expected.schools,
          expectedAmount: expected.expectedAmount,
          chargedAmount: 0,
          paymentStatus: "Unpaid" as TransportationPaymentStatus,
          dateCharged: "",
          datePaid: "",
          staffInitials: "",
          notes: expected.reviewNote,
        } satisfies TransportationFeeRecord;
      });

      const syncedKeys = new Set(synced.map((item) => `${item.weekOf}|${item.location}|${item.familyKey}`));
      const preserved = current.filter((item) => item.weekOf !== weekOf || syncedKeys.has(`${item.weekOf}|${item.location}|${item.familyKey}`));
      const merged = new Map(preserved.map((item) => [String(item.id), item]));
      synced.forEach((item) => merged.set(String(item.id), item));
      return [...merged.values()];
    });
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setRecords((current) => current.map((item) => item.id === editing.id ? editing : item));
    setEditing(null);
  }

  return <MainLayout><div className="mx-auto max-w-[1600px] space-y-6">
    <PageIntro
      eyebrow="Owner / Licensee financial control"
      title="Transportation Fees & Billing"
      description={`Audit weekly transportation charges against active routes. Current policy: ${money(TRANSPORTATION_WEEKLY_FEE)} per weekly fee unit; siblings at the same school share one fee unit.`}
      actions={<PrimaryButton onClick={syncWeek}><RefreshCw className="h-4 w-4" /> Sync This Week From Routes</PrimaryButton>}
    />

    <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-950">
      <strong>Private administrative section:</strong> Owner/Admin can review company-wide billing. Location Licensees can review only records returned for their assigned location. Standard Employees do not have access.
    </div>

    <SectionCard>
      <div className="grid gap-3 md:grid-cols-[220px_1fr_auto] md:items-end">
        <label><span className="mb-1.5 block text-sm font-bold text-slate-700">Week of</span><input type="date" className={inputClass} value={weekOf} onChange={(event) => setWeekOf(event.target.value)} /></label>
        <label className="relative"><span className="mb-1.5 block text-sm font-bold text-slate-700">Search families</span><Search className="pointer-events-none absolute bottom-3 left-3.5 h-4 w-4 text-slate-400" /><input className={`${inputClass} pl-10`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Family, child, guardian, or school…" /></label>
        <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700">{expectedForView.length} family billing group{expectedForView.length === 1 ? "" : "s"} detected</div>
      </div>
    </SectionCard>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Expected This Week" value={money(expectedTotal)} helper="Calculated from current active transportation routes" icon={<CircleDollarSign className="h-5 w-5" />} tone="blue" />
      <StatCard label="Charged" value={money(chargedTotal)} helper={`${Math.max(expectedTotal - chargedTotal, 0) ? `${money(Math.max(expectedTotal - chargedTotal, 0))} not yet matched` : "Charges match current expectation"}`} icon={<CheckCircle2 className="h-5 w-5" />} tone="emerald" />
      <StatCard label="Billing Reviews" value={needsAttention} helper="Missing or mismatched charges" icon={<TriangleAlert className="h-5 w-5" />} tone={needsAttention ? "amber" : "emerald"} />
      <StatCard label="Unpaid" value={unpaid} helper="Payment status still marked unpaid" icon={<Bus className="h-5 w-5" />} tone={unpaid ? "red" : "emerald"} />
    </section>

    <SectionCard title="Weekly family audit" description="The expected amount is recalculated from the current route list whenever you sync. Charged and payment information stays intact for review.">
      {visibleRecords.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No transportation billing records for this week yet. Select the week and choose <strong>Sync This Week From Routes</strong>.</div> :
      <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500"><th className="px-3 py-3">Family</th><th className="px-3 py-3">Transportation</th><th className="px-3 py-3">Expected</th><th className="px-3 py-3">Charged</th><th className="px-3 py-3">Payment</th><th className="px-3 py-3">Audit</th><th className="px-3 py-3"></th></tr></thead><tbody>
        {visibleRecords.map((record) => { const status = transportationChargeStatus(record); return <tr key={record.id} className="border-b border-slate-100 align-top last:border-0"><td className="px-3 py-4"><p className="font-black text-slate-950">{record.familyName}</p><p className="mt-1 text-xs text-slate-500">{record.guardianName}</p><p className="mt-1 text-xs font-semibold text-slate-600">{record.location}</p></td><td className="px-3 py-4"><p className="font-semibold text-slate-800">{record.children.join(", ")}</p><p className="mt-1 text-xs text-slate-500">{record.schools.join(" • ") || "School not entered"}</p></td><td className="px-3 py-4 font-black text-slate-900">{money(record.expectedAmount)}</td><td className="px-3 py-4 font-black text-slate-900">{money(record.chargedAmount)}</td><td className="px-3 py-4"><StatusBadge tone={record.paymentStatus === "Paid" ? "green" : record.paymentStatus === "Unpaid" ? "amber" : "slate"}>{record.paymentStatus}</StatusBadge></td><td className="px-3 py-4"><StatusBadge tone={statusTone(status)}>{status}</StatusBadge>{record.notes && <p className="mt-2 max-w-xs text-xs leading-5 text-slate-500">{record.notes}</p>}</td><td className="px-3 py-4"><SecondaryButton onClick={() => setEditing({ ...record })}>Review</SecondaryButton></td></tr>; })}
      </tbody></table></div>}
    </SectionCard>

    {editing && <Modal title={`Review ${editing.familyName}`} description="Confirm the charge and payment status. The expected amount is route-driven and should only be changed by correcting transportation records." onClose={() => setEditing(null)} footer={<><SecondaryButton onClick={() => setEditing(null)}>Cancel</SecondaryButton><PrimaryButton onClick={() => document.getElementById("transport-fee-save")?.click()}>Save Review</PrimaryButton></>}>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <Field label="Expected amount"><input disabled className={`${inputClass} bg-slate-100`} value={money(editing.expectedAmount)} /></Field>
        <Field label="Charged amount"><input type="number" min="0" step="0.01" className={inputClass} value={editing.chargedAmount} onChange={(event) => setEditing({ ...editing, chargedAmount: Number(event.target.value) || 0 })} /></Field>
        <Field label="Payment status"><select className={inputClass} value={editing.paymentStatus} onChange={(event) => setEditing({ ...editing, paymentStatus: event.target.value as TransportationPaymentStatus })}><option>Unpaid</option><option>Paid</option><option>Waived</option><option>Not Required</option></select></Field>
        <Field label="Date charged"><input type="date" className={inputClass} value={editing.dateCharged} onChange={(event) => setEditing({ ...editing, dateCharged: event.target.value })} /></Field>
        <Field label="Date paid"><input type="date" className={inputClass} value={editing.datePaid} onChange={(event) => setEditing({ ...editing, datePaid: event.target.value })} /></Field>
        <Field label="Staff initials"><input className={inputClass} value={editing.staffInitials} onChange={(event) => setEditing({ ...editing, staffInitials: event.target.value.toUpperCase().slice(0, 5) })} /></Field>
        <Field label="Notes" wide><textarea className={`${inputClass} min-h-24`} value={editing.notes} onChange={(event) => setEditing({ ...editing, notes: event.target.value })} /></Field>
        <button id="transport-fee-save" type="submit" className="hidden">Save</button>
      </form>
    </Modal>}
  </div></MainLayout>;
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "sm:col-span-2" : ""}><span className="mb-1.5 block text-sm font-bold text-slate-700">{label}</span>{children}</label>;
}
