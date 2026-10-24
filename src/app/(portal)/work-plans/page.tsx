"use client";

import MainLayout from "@/components/layout/MainLayout";
import { DemoNotice, Modal, PageIntro, PrimaryButton, SecondaryButton, SectionCard, StatCard, StatusBadge, inputClass } from "@/components/hub/HubUI";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { type WorkTask, starterTasks } from "@/lib/hub-data";
import { usePersistentState } from "@/hooks/usePersistentState";
import { locationThemes, normalizeLocation, type LocationKey } from "@/lib/location-config";
import { downloadSvgAsPng, escapeXml, printSvg } from "@/lib/visual-export";
import { recordAuditEvent } from "@/lib/audit";
import { CheckCircle2, Circle, ClipboardCheck, Download, Filter, Palette, Plus, Printer, Sparkles } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

const blankTask: WorkTask = { id: 0, title: "", owner: "Danielle", category: "Admin", due: "Friday", priority: "Normal", completed: false, initials: "", location: "All Sites" };

function taskSheetSvg(tasks: WorkTask[], owner: string, location: LocationKey, variant: number) {
  const theme = locationThemes[location];
  const sheetTasks = tasks.filter((task) => task.owner === owner && (location === "All Locations" || task.location === "All Sites" || normalizeLocation(task.location) === location)).slice(0, 12);
  const rowHeight = 72;
  const decorations = [
    `<circle cx="930" cy="80" r="95" fill="${theme.accent}" opacity=".18"/>`,
    `<path d="M790 0h290v190z" fill="${theme.accent}" opacity=".18"/><path d="M950 35l16 32 36 5-26 25 6 35-32-17-31 17 6-35-26-25 36-5z" fill="white" opacity=".22"/>`,
    `<g fill="${theme.accent}" opacity=".22"><circle cx="900" cy="45" r="12"/><rect x="960" y="76" width="28" height="28" rx="7"/><circle cx="1030" cy="35" r="18"/></g>`,
  ][variant % 3];
  const rows = sheetTasks.map((task, index) => {
    const y = 250 + index * rowHeight;
    const words = task.title.split(" ");
    const lines: string[] = [];
    let current = "";
    words.forEach((word) => {
      const next = current ? `${current} ${word}` : word;
      if (next.length > 58 && current) { lines.push(current); current = word; } else current = next;
    });
    if (current) lines.push(current);
    return `<g>
      <rect x="55" y="${y}" width="970" height="${rowHeight - 8}" rx="14" fill="${task.completed ? theme.primarySoft : index % 2 ? "#ffffff" : "#f8fafc"}" stroke="${task.completed ? theme.primaryLight : "#e2e8f0"}"/>
      <rect x="75" y="${y + 18}" width="28" height="28" rx="6" fill="${task.completed ? theme.primary : "#ffffff"}" stroke="${task.completed ? theme.primary : "#94a3b8"}" stroke-width="2"/>
      ${task.completed ? `<path d="M82 ${y + 32}l7 7 12-15" fill="none" stroke="${theme.textOnPrimary}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>` : ""}
      ${lines.slice(0, 2).map((line, lineIndex) => `<text x="125" y="${y + 27 + lineIndex * 20}" font-family="Arial, sans-serif" font-size="15" font-weight="750" fill="#0f172a">${escapeXml(line)}</text>`).join("")}
      <text x="810" y="${y + 25}" font-family="Arial, sans-serif" font-size="11" font-weight="800" fill="#64748b">DUE ${escapeXml(task.due.toUpperCase())}</text>
      <text x="810" y="${y + 48}" font-family="Arial, sans-serif" font-size="11" font-weight="800" fill="${theme.primaryDark}">${escapeXml(task.category.toUpperCase())}</text>
      <line x1="925" y1="${y + 43}" x2="1000" y2="${y + 43}" stroke="#64748b" stroke-width="1.5"/>
      <text x="932" y="${y + 33}" font-family="Arial, sans-serif" font-size="9" font-weight="800" fill="#64748b">INITIALS</text>
      ${task.initials ? `<text x="962" y="${y + 58}" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="900" fill="${theme.primaryDark}">${escapeXml(task.initials)}</text>` : ""}
    </g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block" width="1080" height="1350" viewBox="0 0 1080 1350">
    <defs><linearGradient id="head" x1="0" x2="1"><stop offset="0" stop-color="${theme.primaryDark}"/><stop offset="1" stop-color="${theme.primary}"/></linearGradient><filter id="shadow"><feDropShadow dx="0" dy="7" stdDeviation="10" flood-opacity=".12"/></filter><pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="2" fill="${theme.primary}" opacity=".07"/></pattern></defs>
    <rect width="1080" height="1350" fill="#f8fafc"/><rect width="1080" height="1350" fill="url(#dots)"/>
    <rect x="28" y="25" width="1024" height="185" rx="34" fill="url(#head)" filter="url(#shadow)"/>${decorations}
    <text x="65" y="68" font-family="Arial, sans-serif" font-size="15" font-weight="900" letter-spacing="2" fill="${theme.textOnPrimary}" opacity=".82">TCS EMPLOYEE WORK PLAN</text>
    <text x="65" y="120" font-family="Arial, sans-serif" font-size="38" font-weight="900" fill="${theme.textOnPrimary}">${escapeXml(owner)}</text>
    <text x="65" y="154" font-family="Arial, sans-serif" font-size="16" font-weight="750" fill="${theme.textOnPrimary}" opacity=".92">${escapeXml(location)} • Weekly Goals & Accountability</text>
    <text x="65" y="181" font-family="Arial, sans-serif" font-size="12" font-weight="800" fill="${theme.accent}">Complete each task, then enter your initials.</text>
    ${rows}
    <rect x="55" y="1135" width="970" height="150" rx="22" fill="white" stroke="${theme.primaryLight}" stroke-width="2"/>
    <text x="80" y="1170" font-family="Arial, sans-serif" font-size="14" font-weight="900" fill="${theme.primaryDark}">EMPLOYEE ACKNOWLEDGMENT</text>
    <text x="80" y="1200" font-family="Arial, sans-serif" font-size="12" font-weight="650" fill="#475569">I acknowledge that I reviewed this work plan and accurately initialed the tasks I completed.</text>
    <line x1="80" y1="1250" x2="510" y2="1250" stroke="#64748b"/><text x="80" y="1273" font-family="Arial, sans-serif" font-size="10" font-weight="800" fill="#64748b">EMPLOYEE SIGNATURE</text>
    <line x1="600" y1="1250" x2="810" y2="1250" stroke="#64748b"/><text x="600" y="1273" font-family="Arial, sans-serif" font-size="10" font-weight="800" fill="#64748b">DATE</text>
    <line x1="850" y1="1250" x2="995" y2="1250" stroke="#64748b"/><text x="850" y="1273" font-family="Arial, sans-serif" font-size="10" font-weight="800" fill="#64748b">SUPERVISOR INITIALS</text>
    <text x="1025" y="1322" text-anchor="end" font-family="Arial, sans-serif" font-size="10" font-weight="700" fill="#94a3b8">Generated in TCS Operations Hub</text>
  </svg>`;
}

export default function WorkPlansPage() {
  const [rawTasks, setTasks] = usePersistentState<WorkTask[]>("tcs-work-tasks", starterTasks);
  const tasks = rawTasks.map((task) => ({ ...task, initials: task.initials ?? "" }));
  const { location: activeLocation } = useHubLocation();
  const [owner, setOwner] = useState("All Owners");
  const [showCompleted, setShowCompleted] = useState(true);
  const [editing, setEditing] = useState<WorkTask | null>(null);
  const [printOwner, setPrintOwner] = useState("Danielle");
  const [variant, setVariant] = useState(0);
  const owners = ["All Owners", ...Array.from(new Set(tasks.map((task) => task.owner)))];
  const filtered = useMemo(() => tasks.filter((task) => (owner === "All Owners" || task.owner === owner) && (showCompleted || !task.completed) && (activeLocation === "All Locations" || task.location === "All Sites" || normalizeLocation(task.location) === activeLocation)), [tasks, owner, showCompleted, activeLocation]);
  const percent = Math.round((tasks.filter((task) => task.completed).length / Math.max(tasks.length, 1)) * 100);
  const printLocation = activeLocation;
  const printable = taskSheetSvg(tasks, printOwner, printLocation, variant);
  const filename = `TCS-${printOwner.replaceAll(" ", "-")}-work-plan`;

  async function exportWorkPlan(format: "PNG" | "PRINT") {
    await recordAuditEvent({ action: "EXPORT", tableName: "work_plans", location: printLocation, metadata: { employee: printOwner, format, taskCount: tasks.length } });
    if (format === "PNG") await downloadSvgAsPng(printable, filename);
    else printSvg(printable, `${printOwner} Work Plan`);
  }

  function setInitials(id: number, initials: string) {
    setTasks((current) => current.map((task) => task.id === id ? { ...task, initials: initials.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4) } : task));
  }
  function completeWithInitials(id: number) {
    setTasks((current) => current.map((task) => task.id === id ? { ...task, completed: true, initials: (task.initials ?? "").toUpperCase(), completedAt: new Date().toLocaleDateString() } : task));
  }
  function reopen(id: number) {
    setTasks((current) => current.map((task) => task.id === id ? { ...task, completed: false, initials: "", completedAt: undefined } : task));
  }
  function save(event: FormEvent) { event.preventDefault(); if (!editing) return; setTasks((current) => current.some((item) => item.id === editing.id) ? current.map((item) => item.id === editing.id ? editing : item) : [...current, editing]); setEditing(null); }
  function addSuggested() { const suggested: WorkTask = { id: Date.now(), title: "Review next week’s enrollment and capacity", owner: "Danielle", category: "Enrollment", due: "Friday", priority: "High", completed: false, initials: "", location: activeLocation === "All Locations" ? "All Sites" : activeLocation }; setTasks((current) => [...current, suggested]); }

  return <MainLayout><div className="mx-auto max-w-[1500px] space-y-6">
    <PageIntro eyebrow="Initials-based accountability" title="Work Plans" description="Staff complete each task by entering their initials. The Hub can also generate a polished printable task sheet with initials lines and employee acknowledgment." actions={<><SecondaryButton onClick={addSuggested}><Sparkles className="h-4 w-4" /> Add Suggested Task</SecondaryButton><PrimaryButton onClick={() => setEditing({ ...blankTask, id: Date.now(), location: activeLocation === "All Locations" ? "All Sites" : activeLocation })}><Plus className="h-4 w-4" /> Add Task</PrimaryButton></>} />
    <DemoNotice />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Total Tasks" value={tasks.length} icon={<ClipboardCheck className="h-5 w-5" />} />
      <StatCard label="Initialed Complete" value={tasks.filter((task) => task.completed && task.initials).length} helper={`${percent}% of weekly plan`} icon={<CheckCircle2 className="h-5 w-5" />} tone="blue" />
      <StatCard label="Urgent Open" value={tasks.filter((task) => !task.completed && task.priority === "Urgent").length} icon={<Circle className="h-5 w-5" />} tone="red" />
      <StatCard label="Owners Assigned" value={owners.length - 1} icon={<Filter className="h-5 w-5" />} tone="purple" />
    </section>

    <SectionCard><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex flex-wrap gap-3"><select className={`${inputClass} w-auto min-w-48`} value={owner} onChange={(event) => setOwner(event.target.value)}>{owners.map((item) => <option key={item}>{item}</option>)}</select><label className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold"><input type="checkbox" checked={showCompleted} onChange={(event) => setShowCompleted(event.target.checked)} /> Show completed</label></div><div className="min-w-56"><div className="flex justify-between text-xs font-bold text-slate-500"><span>Weekly progress</span><span>{percent}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${percent}%` }} /></div></div></div></SectionCard>

    <div className="grid gap-6 xl:grid-cols-2">{owners.slice(1).map((person) => { const personTasks = filtered.filter((task) => task.owner === person); if (!personTasks.length) return null; return <SectionCard key={person} title={`${person}’s Work Plan`} description={`${personTasks.filter((task) => task.completed).length} of ${personTasks.length} initialed complete`}><div className="space-y-3">{personTasks.map((task) => <div key={task.id} className={`rounded-2xl border p-4 ${task.completed ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200"}`}>
      <button onClick={() => setEditing({ ...task })} className="w-full text-left"><p className={`font-black ${task.completed ? "text-slate-500 line-through" : "text-slate-950"}`}>{task.title}</p><div className="mt-2 flex flex-wrap gap-2"><StatusBadge tone={task.priority === "Urgent" ? "red" : task.priority === "High" ? "amber" : "slate"}>{task.priority}</StatusBadge><StatusBadge tone="blue">{task.category}</StatusBadge><span className="text-xs font-bold text-slate-500">Due {task.due} • {task.location}</span></div></button>
      <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center"><label className="flex items-center gap-2"><span className="text-xs font-black uppercase text-slate-500">Staff initials</span><input aria-label={`Initials for ${task.title}`} className="w-24 rounded-xl border border-slate-300 px-3 py-2 text-center text-sm font-black uppercase" placeholder="DM" value={task.initials ?? ""} disabled={task.completed} onChange={(event) => setInitials(task.id, event.target.value)} /></label>{task.completed ? <><StatusBadge tone="green">Completed by {task.initials || "—"}</StatusBadge><button onClick={() => reopen(task.id)} className="text-xs font-black text-slate-500 underline">Reopen</button></> : <button disabled={(task.initials ?? "").length < 2} onClick={() => completeWithInitials(task.id)} className="tcs-primary-button rounded-xl px-3 py-2 text-xs font-black disabled:cursor-not-allowed disabled:opacity-40">Initial & Complete</button>}</div>
    </div>)}</div></SectionCard>; })}</div>

    <SectionCard title="Printable Work Plan Image" description="Choose an employee, then save the sheet as a phone-ready PNG or print it.">
      <div className="grid gap-5 xl:grid-cols-[320px_1fr]"><div className="space-y-4"><label><span className="mb-1.5 block text-sm font-bold">Employee</span><select className={inputClass} value={printOwner} onChange={(event) => setPrintOwner(event.target.value)}>{owners.slice(1).map((item) => <option key={item}>{item}</option>)}</select></label><div className="rounded-2xl tcs-themed-surface p-4 text-sm leading-6 text-slate-700"><strong>Included:</strong> task checkboxes, initials lines, priorities, due days, employee signature, date, and supervisor initials.</div><div className="flex flex-wrap gap-2"><PrimaryButton onClick={() => void exportWorkPlan("PNG")}><Download className="h-4 w-4" /> Save PNG</PrimaryButton><SecondaryButton onClick={() => void exportWorkPlan("PRINT")}><Printer className="h-4 w-4" /> Print</SecondaryButton><SecondaryButton onClick={() => setVariant((current) => current + 1)}><Palette className="h-4 w-4" /> New Look</SecondaryButton></div></div><div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"><div className="mx-auto max-w-[680px]" dangerouslySetInnerHTML={{ __html: printable }} /></div></div>
    </SectionCard>

    {editing && <Modal title={tasks.some((task) => task.id === editing.id) ? "Edit Task" : "Add Task"} description="Keep the task specific enough for the employee to complete and initial." onClose={() => setEditing(null)} footer={<>{tasks.some((task) => task.id === editing.id) && <button className="mr-auto rounded-xl px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50" onClick={() => { setTasks((current) => current.filter((task) => task.id !== editing.id)); setEditing(null); }}>Delete</button>}<SecondaryButton onClick={() => setEditing(null)}>Cancel</SecondaryButton><PrimaryButton onClick={() => document.getElementById("task-save")?.click()}>Save Task</PrimaryButton></>}>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2"><Field label="Task" wide><textarea required className={`${inputClass} min-h-24`} value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} /></Field><Field label="Owner"><input className={inputClass} value={editing.owner} onChange={(event) => setEditing({ ...editing, owner: event.target.value })} /></Field><Field label="Due"><input className={inputClass} value={editing.due} onChange={(event) => setEditing({ ...editing, due: event.target.value })} /></Field><Field label="Category"><select className={inputClass} value={editing.category} onChange={(event) => setEditing({ ...editing, category: event.target.value as WorkTask["category"] })}><option>Admin</option><option>Licensing</option><option>Cleaning</option><option>Enrollment</option><option>Transportation</option><option>Marketing</option></select></Field><Field label="Priority"><select className={inputClass} value={editing.priority} onChange={(event) => setEditing({ ...editing, priority: event.target.value as WorkTask["priority"] })}><option>Urgent</option><option>High</option><option>Normal</option></select></Field><Field label="Location"><input className={inputClass} value={editing.location} onChange={(event) => setEditing({ ...editing, location: event.target.value })} /></Field><button id="task-save" className="hidden" type="submit">Save</button></form>
    </Modal>}
  </div></MainLayout>;
}
function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) { return <label className={wide ? "sm:col-span-2" : ""}><span className="mb-1.5 block text-sm font-bold text-slate-700">{label}</span>{children}</label>; }
