"use client";

import MainLayout from "@/components/layout/MainLayout";
import { DemoNotice, Modal, PageIntro, PrimaryButton, SecondaryButton, SectionCard, StatCard, StatusBadge, inputClass } from "@/components/hub/HubUI";
import { type Shift, starterShifts } from "@/lib/hub-data";
import { usePersistentState } from "@/hooks/usePersistentState";
import { CalendarDays, Clock3, Plus, ShieldCheck, Users } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const blankShift: Shift = { id: 0, employee: "", role: "Teacher", location: "Halcom", day: "Monday", start: "8:00 AM", end: "5:00 PM", assignment: "Floor coverage" };

export default function SchedulingPage() {
  const [shifts, setShifts] = usePersistentState<Shift[]>("tcs-shifts", starterShifts);
  const [selectedDay, setSelectedDay] = useState("Monday");
  const [editing, setEditing] = useState<Shift | null>(null);
  const [view, setView] = useState<"Week" | "Day">("Week");

  const todaysShifts = shifts.filter((shift) => shift.day === selectedDay);
  const uniqueEmployees = new Set(shifts.map((shift) => shift.employee)).size;
  const transportationShifts = shifts.filter((shift) => shift.location === "Transportation").length;

  const coverageByDay = useMemo(() => days.map((day) => ({ day, count: shifts.filter((shift) => shift.day === day).length })), [shifts]);

  function openShift(shift?: Shift, day = selectedDay) {
    setEditing(shift ? { ...shift } : { ...blankShift, id: Date.now(), day });
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setShifts((current) => current.some((item) => item.id === editing.id) ? current.map((item) => item.id === editing.id ? editing : item) : [...current, editing]);
    setEditing(null);
  }

  function removeShift() {
    if (!editing) return;
    setShifts((current) => current.filter((item) => item.id !== editing.id));
    setEditing(null);
  }

  return <MainLayout><div className="mx-auto max-w-[1600px] space-y-6">
    <PageIntro eyebrow="Weekly staffing" title="Scheduling" description="Build the complete staff schedule, assign rooms and transportation, and check that each day has enough coverage." actions={<><div className="flex rounded-xl border border-slate-300 bg-white p-1"><button onClick={() => setView("Week")} className={`rounded-lg px-3 py-2 text-sm font-bold ${view === "Week" ? "bg-emerald-600 text-white" : "text-slate-600"}`}>Week</button><button onClick={() => setView("Day")} className={`rounded-lg px-3 py-2 text-sm font-bold ${view === "Day" ? "bg-emerald-600 text-white" : "text-slate-600"}`}>Day</button></div><PrimaryButton onClick={() => openShift()}><Plus className="h-4 w-4" /> Add Shift</PrimaryButton></>} />
    <DemoNotice />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Scheduled Employees" value={uniqueEmployees} icon={<Users className="h-5 w-5" />} />
      <StatCard label="Total Weekly Shifts" value={shifts.length} icon={<CalendarDays className="h-5 w-5" />} tone="blue" />
      <StatCard label="Transportation Shifts" value={transportationShifts} icon={<Clock3 className="h-5 w-5" />} tone="purple" />
      <StatCard label="Coverage Status" value="Review" helper="Weekend has one-person coverage" icon={<ShieldCheck className="h-5 w-5" />} tone="amber" />
    </section>

    <SectionCard title="Week of July 27–August 2" description="Click any shift to edit it">
      {view === "Week" ? <div className="grid gap-4 lg:grid-cols-7">
        {days.map((day) => <div key={day} className={`min-w-0 rounded-2xl border p-3 ${day === selectedDay ? "border-emerald-300 bg-emerald-50/40" : "border-slate-200 bg-slate-50/60"}`}>
          <button onClick={() => setSelectedDay(day)} className="w-full text-left"><p className="font-black text-slate-900">{day.slice(0, 3)}</p><p className="text-xs text-slate-500">{coverageByDay.find((item) => item.day === day)?.count ?? 0} shifts</p></button>
          <div className="mt-3 space-y-2">{shifts.filter((shift) => shift.day === day).map((shift) => <button key={shift.id} onClick={() => openShift(shift)} className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-left shadow-sm hover:border-emerald-300"><p className="truncate text-sm font-black text-slate-900">{shift.employee}</p><p className="mt-1 text-xs font-semibold text-emerald-700">{shift.start}–{shift.end}</p><p className="mt-1 truncate text-xs text-slate-500">{shift.assignment}</p></button>)}</div>
          <button onClick={() => openShift(undefined, day)} className="mt-3 w-full rounded-xl border border-dashed border-slate-300 px-2 py-2 text-xs font-bold text-slate-500 hover:border-emerald-400 hover:text-emerald-700">+ Add</button>
        </div>)}
      </div> : <DayView day={selectedDay} shifts={todaysShifts} onEdit={openShift} />}
    </SectionCard>

    <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
      <SectionCard title={`${selectedDay} Coverage`} description="Room and transportation assignments">
        <DayView day={selectedDay} shifts={todaysShifts} onEdit={openShift} />
      </SectionCard>
      <SectionCard title="Schedule Checks" description="Items to verify before publishing">
        <div className="space-y-3">
          <CheckRow label="Halcom opening coverage" helper="Danielle opens at 6:00 AM" ok />
          <CheckRow label="Friday handoff" helper="Evangeline takes over at 10:00 AM" ok />
          <CheckRow label="Transportation coverage" helper="Driver shifts are entered Tue, Thu, and Fri" ok />
          <CheckRow label="Weekend backup coverage" helper="Only Latrice is currently listed" ok={false} />
          <CheckRow label="Employee acknowledgements" helper="Collect initials after schedule is finalized" ok={false} />
        </div>
      </SectionCard>
    </div>

    {editing && <Modal title={shifts.some((item) => item.id === editing.id) ? "Edit Shift" : "Add Shift"} description="Changes appear immediately on the weekly schedule." onClose={() => setEditing(null)} footer={<>{shifts.some((item) => item.id === editing.id) && <button onClick={removeShift} className="mr-auto rounded-xl px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50">Delete Shift</button>}<SecondaryButton onClick={() => setEditing(null)}>Cancel</SecondaryButton><PrimaryButton onClick={() => document.getElementById("shift-save")?.click()}>Save Shift</PrimaryButton></>}>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <Field label="Employee"><input required className={inputClass} value={editing.employee} onChange={(e) => setEditing({ ...editing, employee: e.target.value })} /></Field>
        <Field label="Role"><input className={inputClass} value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })} /></Field>
        <Field label="Day"><select className={inputClass} value={editing.day} onChange={(e) => setEditing({ ...editing, day: e.target.value })}>{days.map((day) => <option key={day}>{day}</option>)}</select></Field>
        <Field label="Location"><select className={inputClass} value={editing.location} onChange={(e) => setEditing({ ...editing, location: e.target.value })}><option>Halcom</option><option>Division</option><option>21st Street</option><option>33rd Street</option><option>42nd Street</option><option>Tehachapi</option><option>Transportation</option></select></Field>
        <Field label="Start"><input className={inputClass} value={editing.start} onChange={(e) => setEditing({ ...editing, start: e.target.value })} /></Field>
        <Field label="End"><input className={inputClass} value={editing.end} onChange={(e) => setEditing({ ...editing, end: e.target.value })} /></Field>
        <Field label="Assignment" wide><input className={inputClass} value={editing.assignment} onChange={(e) => setEditing({ ...editing, assignment: e.target.value })} /></Field>
        <button id="shift-save" type="submit" className="hidden">Save</button>
      </form>
    </Modal>}
  </div></MainLayout>;
}

function DayView({ day, shifts, onEdit }: { day: string; shifts: Shift[]; onEdit: (shift: Shift) => void }) { return <div className="space-y-3">{shifts.length ? shifts.map((shift) => <button key={shift.id} onClick={() => onEdit(shift)} className="flex w-full flex-col gap-2 rounded-2xl border border-slate-200 p-4 text-left hover:border-emerald-300 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black text-slate-950">{shift.employee} <span className="font-semibold text-slate-400">• {shift.role}</span></p><p className="mt-1 text-sm text-slate-500">{shift.assignment} • {shift.location}</p></div><StatusBadge tone="blue">{shift.start}–{shift.end}</StatusBadge></button>) : <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No shifts entered for {day}.</div>}</div>; }
function CheckRow({ label, helper, ok }: { label: string; helper: string; ok: boolean }) { return <div className="flex items-start gap-3 rounded-xl border border-slate-200 p-3"><div className={`mt-0.5 h-3 w-3 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-500"}`} /><div><p className="font-bold text-slate-900">{label}</p><p className="mt-1 text-xs text-slate-500">{helper}</p></div></div>; }
function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) { return <label className={wide ? "sm:col-span-2" : ""}><span className="mb-1.5 block text-sm font-bold text-slate-700">{label}</span>{children}</label>; }
