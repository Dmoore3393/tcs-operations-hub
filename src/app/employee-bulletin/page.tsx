"use client";

import Link from "next/link";
import {
  Bell,
  BookOpen,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  FileText,
  GraduationCap,
  Home,
  LogOut,
  Megaphone,
  Pencil,
  Pin,
  Plus,
  Search,
  Star,
  Trash2,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

import { useAuth } from "@/components/providers/AuthProvider";
import { usePersistentState } from "@/hooks/usePersistentState";

type BoardSectionKey = "announcements" | "reminders" | "policies" | "training" | "recognition" | "notes";

type BulletinItem = {
  id: string;
  title: string;
  subtitle: string;
  date: string;
  tone: "green" | "blue" | "yellow" | "red";
  status?: string;
};

type BulletinData = Record<BoardSectionKey, BulletinItem[]>;

const initialBoard: BulletinData = {
  announcements: [
    { id: "ann-1", title: "Fall Family Fun Day – Save the Date!", subtitle: "A day of fun, connection and community.", date: "Oct 14", tone: "green" },
    { id: "ann-2", title: "New Wellness Resources Available", subtitle: "Check out our updated wellness page!", date: "Oct 10", tone: "blue" },
    { id: "ann-3", title: "TCS Growth Update", subtitle: "Celebrating our expanding programs!", date: "Oct 8", tone: "yellow" },
  ],
  reminders: [
    { id: "rem-1", title: "Submit October Time Off Requests", subtitle: "Due by Friday, Oct 18", date: "Oct 14", tone: "red" },
    { id: "rem-2", title: "Update Emergency Contact Info", subtitle: "Keep your information current", date: "Oct 12", tone: "green" },
    { id: "rem-3", title: "Complete Building Safety Checklist", subtitle: "Due by Oct 20", date: "Oct 10", tone: "yellow" },
  ],
  policies: [
    { id: "pol-1", title: "Updated Attendance Policy", subtitle: "Effective October 1, 2024", date: "Oct 9", tone: "green" },
    { id: "pol-2", title: "Revised Sick Leave Guidelines", subtitle: "Please review the new changes", date: "Oct 7", tone: "blue" },
    { id: "pol-3", title: "Handbook Addendum – PTO", subtitle: "Now available in Documents", date: "Oct 3", tone: "yellow" },
  ],
  training: [
    { id: "tr-1", title: "Child Abuse Prevention (Annual)", subtitle: "Due Oct 31, 2024", date: "Due Soon", tone: "red", status: "Due Soon" },
    { id: "tr-2", title: "Emergency Preparedness", subtitle: "Due Oct 31, 2024", date: "Due Soon", tone: "yellow", status: "Due Soon" },
    { id: "tr-3", title: "Positive Guidance in Child Care", subtitle: "Due Nov 15, 2024", date: "Not Started", tone: "blue", status: "Not Started" },
  ],
  recognition: [
    { id: "rec-1", title: "Shout Out to Our Amazing Team!", subtitle: "Thank you for showing up with kindness, flexibility, and heart every day. You make TCS a special place!", date: "You Make a Difference! ♡", tone: "yellow" },
  ],
  notes: [
    { id: "note-1", title: "Be Kind\nWork Hard\nMake a\nDifference ♡", subtitle: "", date: "", tone: "blue" },
    { id: "note-2", title: "Children\nToday\nBrighter\nTomorrows ♡", subtitle: "", date: "", tone: "yellow" },
    { id: "note-3", title: "Small\nMoments\nBig Impact\n♡", subtitle: "", date: "", tone: "red" },
  ],
};

const panelMeta: Record<BoardSectionKey, { title: string; icon: React.ReactNode; tint: string }> = {
  announcements: { title: "Announcements", icon: <Megaphone className="h-5 w-5" />, tint: "bg-sky-100" },
  reminders: { title: "Reminders", icon: <CalendarDays className="h-5 w-5" />, tint: "bg-amber-100" },
  policies: { title: "Policy Updates", icon: <FileText className="h-5 w-5" />, tint: "bg-lime-100" },
  training: { title: "Training Due", icon: <GraduationCap className="h-5 w-5" />, tint: "bg-rose-100" },
  recognition: { title: "Employee Recognition", icon: <Star className="h-5 w-5" />, tint: "bg-violet-100" },
  notes: { title: "Pinned Notes", icon: <Pin className="h-5 w-5" />, tint: "bg-amber-100" },
};

const dotClass = { green: "bg-[#5b9f32]", blue: "bg-[#2b95d6]", yellow: "bg-[#f6b80f]", red: "bg-[#e5262a]" } as const;

function newItem(section: BoardSectionKey): BulletinItem {
  return { id: `${section}-${Date.now()}`, title: "", subtitle: "", date: "", tone: section === "reminders" || section === "training" ? "red" : "green" };
}

export default function EmployeeBulletinPage() {
  const { profile, user, canManageSystem, signOut } = useAuth();
  const [board, setBoard] = usePersistentState<BulletinData>("tcs-employee-bulletin-v1", initialBoard);
  const [search, setSearch] = useState("");
  const [openPanel, setOpenPanel] = useState<BoardSectionKey | null>(null);
  const [editing, setEditing] = useState<{ section: BoardSectionKey; item: BulletinItem } | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const staffName = profile?.full_name || user?.email || "TCS Staff";
  const initials = staffName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "TCS";

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return (Object.keys(board) as BoardSectionKey[]).flatMap((section) =>
      board[section]
        .filter((item) => `${item.title} ${item.subtitle} ${item.date}`.toLowerCase().includes(q))
        .map((item) => ({ section, item })),
    );
  }, [board, search]);

  const alertCount = board.reminders.filter((item) => item.tone === "red").length + board.training.filter((item) => item.status === "Due Soon").length;

  function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setBoard((current) => {
      const exists = current[editing.section].some((item) => item.id === editing.item.id);
      return {
        ...current,
        [editing.section]: exists
          ? current[editing.section].map((item) => item.id === editing.item.id ? editing.item : item)
          : [...current[editing.section], editing.item],
      };
    });
    setEditing(null);
  }

  function deleteItem(section: BoardSectionKey, id: string) {
    setBoard((current) => ({ ...current, [section]: current[section].filter((item) => item.id !== id) }));
  }

  return (
    <div className="min-h-screen bg-[#f6f5f0] text-[#0c2e53]">
      <header className="sticky top-0 z-40 flex h-[76px] items-center border-b border-slate-200 bg-white px-5 shadow-sm lg:px-7">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <div className="relative h-12 w-20 shrink-0">
            <div className="absolute bottom-1 left-1 h-1.5 w-16 rounded-full bg-[#5b9432]" />
            <div className="absolute left-7 top-1 h-7 w-8 rotate-45 rounded-sm border-[3px] border-[#0b3158] bg-white" />
            <div className="absolute left-8 top-4 flex gap-0.5 text-[13px]">🌿👨‍👩‍👧</div>
          </div>
          <div className="hidden sm:block">
            <p className="font-serif text-[25px] font-black leading-none tracking-[.04em] text-[#0b3158]">THOMASON</p>
            <p className="mt-1 text-[9px] font-black tracking-[.12em] text-[#5b9432]">CHILDCARE SOLUTIONS</p>
          </div>
        </Link>

        <div className="ml-7 hidden border-l border-slate-300 pl-7 md:block">
          <p className="font-serif text-2xl italic text-[#0b3158]">TCS Operations Hub</p>
        </div>
        <p className="ml-8 hidden text-[10px] font-black tracking-[.35em] text-[#0b3158] xl:block">PEOPLE • PROGRAMS • PURPOSE</p>

        <div className="ml-auto flex items-center gap-3">
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0b3158]" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="h-10 w-52 rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-[#5b9432] lg:w-64" placeholder="Search..." />
            {search.trim() && (
              <div className="absolute right-0 top-12 z-50 w-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                <div className="border-b border-slate-100 px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-400">Search results</div>
                <div className="max-h-80 overflow-y-auto p-2">
                  {searchResults.map(({ section, item }) => (
                    <button key={`${section}-${item.id}`} onClick={() => { setOpenPanel(section); setSearch(""); }} className="w-full rounded-xl px-3 py-3 text-left hover:bg-slate-50">
                      <p className="text-sm font-black text-[#0b3158]">{item.title.split("\n").join(" ")}</p>
                      <p className="mt-1 text-xs text-slate-500">{panelMeta[section].title}</p>
                    </button>
                  ))}
                  {!searchResults.length && <p className="p-4 text-sm text-slate-500">No bulletin items match your search.</p>}
                </div>
              </div>
            )}
          </div>

          <button onClick={() => setShowNotifications(true)} className="relative flex h-11 w-11 items-center justify-center rounded-full text-[#0b3158] hover:bg-slate-50" aria-label="Notifications">
            <Bell className="h-6 w-6" />
            {alertCount > 0 && <span className="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white">{alertCount}</span>}
          </button>
          <span className="hidden h-9 w-px bg-slate-300 sm:block" />
          <button onClick={() => setShowUserMenu((current) => !current)} className="relative flex items-center gap-3 text-left">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0b3158] text-sm font-black text-white">{initials}</span>
            <span className="hidden lg:block"><strong className="block text-sm text-[#0b3158]">{staffName}</strong><span className="block text-xs text-slate-500">{profile?.role || "TCS Staff"}</span></span>
            <ChevronDown className="hidden h-4 w-4 lg:block" />
          </button>
          {showUserMenu && (
            <div className="absolute right-5 top-16 z-50 w-64 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
              <p className="font-black text-[#0b3158]">{staffName}</p>
              <p className="mt-1 text-xs text-slate-500">{profile?.email || user?.email}</p>
              <button onClick={() => void signOut()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#0b3158] px-4 py-2.5 text-sm font-black text-white"><LogOut className="h-4 w-4" /> Sign Out</button>
            </div>
          )}
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-76px)]">
        <aside className="hidden w-[190px] shrink-0 flex-col bg-gradient-to-b from-[#123b62] to-[#082a4d] text-white lg:flex">
          <BulletinNav href="/" icon={<Home />} label="Dashboard" />
          <BulletinNav active icon={<Pin />} label="Employee\nBulletin Board" />
          <BulletinNav href="/scheduling" icon={<CalendarDays />} label="Calendar" />
          <BulletinNav href="/employees" icon={<Users />} label="People & Teams" />
          <BulletinNav href="/files" icon={<FileText />} label="Documents" />
          <button onClick={() => setOpenPanel("training")} className="flex items-center gap-4 px-5 py-3.5 text-left text-sm font-semibold hover:bg-white/10"><GraduationCap className="h-5 w-5" />Training</button>
          <BulletinNav href="/digital-forms" icon={<FileText />} label="Policies & Forms" />
          <BulletinNav href="/print-studio" icon={<BookOpen />} label="Resources" />
          <button onClick={() => setShowHelp(true)} className="flex items-center gap-4 px-5 py-3.5 text-left text-sm font-semibold hover:bg-white/10"><CircleHelp className="h-5 w-5" />Help & Support</button>
          <div className="mt-auto px-5 pb-9 text-center">
            <div className="text-5xl">🌱</div>
            <p className="mt-3 font-serif text-xl italic leading-7">Stronger<br />Together<br />for Brighter<br />Tomorrows</p>
            <p className="mt-2 text-3xl text-[#7eb23c]">♡</p>
          </div>
        </aside>

        <main className="min-w-0 flex-1 bg-white">
          <section className="relative min-h-[390px] overflow-hidden border-b-[6px] border-[#8b5a2b] bg-[#c98d4d] px-6 py-7 sm:px-9 lg:px-14" style={{ backgroundImage: "radial-gradient(circle at 20% 25%, rgba(90,52,20,.18) 0 2px, transparent 2.5px), radial-gradient(circle at 70% 65%, rgba(255,255,255,.12) 0 1px, transparent 1.5px)" }}>
            <div className="absolute inset-x-8 inset-y-4 border-[12px] border-[#9d6737] shadow-inner" />
            <StickyNote className="left-[12%] top-8 -rotate-6 bg-sky-200" text={<>Teamwork<br />makes<br />our dream<br />work!</>} pin="green" />
            <StickyNote className="left-[21%] top-20 rotate-6 bg-[#ffe169]" text={<Megaphone className="mx-auto h-10 w-10" />} pin="gold" small />
            <StickyNote className="left-[17%] top-44 rotate-2 bg-[#f59db1]" text={<>Updates<br />Reminders<br />Announcements</>} pin="green" />
            <StickyNote className="right-[15%] top-8 rotate-6 bg-[#cce776]" text={<>Together<br />We Care.<br />Together<br />We Grow.<br />♡</>} pin="green" />
            <StickyNote className="right-[6%] top-28 rotate-3 bg-sky-200" text={<Star className="mx-auto h-12 w-12" />} pin="green" small />

            <div className="relative mx-auto mt-4 max-w-[720px] rounded-sm bg-[#fff9e9] px-6 py-5 text-center shadow-xl sm:px-10">
              <h1 className="text-[42px] font-black leading-none tracking-[.03em] text-[#0b3158] sm:text-[58px] lg:text-[72px]">EMPLOYEE</h1>
              <p className="mt-1 text-[34px] font-black italic leading-none text-[#4f8b2d] sm:text-[48px] lg:text-[56px]">BULLETIN BOARD</p>
              <div className="mx-auto mt-3 h-1.5 w-3/5 -rotate-1 bg-[#0b3158]" />
              <p className="mt-1 text-5xl leading-none text-[#0b3158]">♡</p>
            </div>

            <div className="absolute bottom-0 right-[5%] hidden items-end gap-3 xl:flex">
              <div className="relative mb-2 flex h-40 w-40 items-center justify-center rounded-[45%] bg-[#75a92f] text-[96px] shadow-lg">🐊<span className="absolute right-3 top-2 -rotate-6 rounded-t-full bg-red-600 px-3 py-1 text-xl font-black text-[#0b3158]">T</span></div>
              <div className="mb-2 flex h-44 w-16 items-center justify-center rounded-2xl bg-[#0c3156] px-2 text-center text-xs font-black leading-5 text-white shadow-lg">WE<br /><span className="text-sky-400">CARE.</span><br />WE<br /><span className="text-lime-400">TEACH.</span><br />WE<br /><span className="text-amber-400">INSPIRE.</span><br />♡</div>
            </div>
          </section>

          <section className="px-5 pb-4 pt-4 sm:px-7">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div><h2 className="text-2xl font-black text-[#0b3158] sm:text-3xl">Welcome to the Employee Bulletin Board</h2><p className="mt-1 text-base text-[#315274]">Stay informed. Stay connected. We’re all in this together!</p></div>
              <p className="rotate-[-4deg] font-serif text-2xl italic text-[#0b3158]">Same Team.<br /><span className="ml-4">Brighter Tomorrows. ♡</span></p>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-3">
              <BulletinPanel section="announcements" board={board} onOpen={setOpenPanel} />
              <BulletinPanel section="reminders" board={board} onOpen={setOpenPanel} />
              <BulletinPanel section="policies" board={board} onOpen={setOpenPanel} />
              <BulletinPanel section="training" board={board} onOpen={setOpenPanel} />
              <RecognitionPanel items={board.recognition} onOpen={() => setOpenPanel("recognition")} />
              <NotesPanel items={board.notes} onOpen={() => setOpenPanel("notes")} />
            </div>

            <footer className="mt-4 flex flex-col gap-3 rounded-full bg-gradient-to-r from-[#e7f0d9] via-white to-[#e7f0d9] px-6 py-3 text-sm font-semibold italic text-[#173f27] sm:flex-row sm:items-center sm:justify-between">
              <span>🌱　“Caring for children is a team effort, and every role makes a difference.”</span>
              <span className="not-italic tracking-[.28em] text-[#0b3158]">WE CARE.　WE TEACH.　WE INSPIRE. ♡</span>
            </footer>
          </section>
        </main>
      </div>

      {openPanel && (
        <Modal title={panelMeta[openPanel].title} onClose={() => setOpenPanel(null)}>
          <div className="space-y-3">
            {board[openPanel].map((item) => (
              <div key={item.id} className="flex gap-3 rounded-2xl border border-slate-200 p-4">
                <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${dotClass[item.tone]}`} />
                <div className="min-w-0 flex-1"><p className="whitespace-pre-line font-black text-[#0b3158]">{item.title}</p>{item.subtitle && <p className="mt-1 text-sm text-slate-500">{item.subtitle}</p>}{item.date && <p className="mt-2 text-xs font-bold text-slate-400">{item.date}</p>}</div>
                {canManageSystem && <div className="flex shrink-0 gap-2"><button onClick={() => setEditing({ section: openPanel, item: { ...item } })} className="rounded-lg border border-slate-200 p-2 text-slate-600"><Pencil className="h-4 w-4" /></button><button onClick={() => deleteItem(openPanel, item.id)} className="rounded-lg border border-red-200 p-2 text-red-600"><Trash2 className="h-4 w-4" /></button></div>}
              </div>
            ))}
            {canManageSystem && <button onClick={() => setEditing({ section: openPanel, item: newItem(openPanel) })} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0b3158] px-4 py-3 text-sm font-black text-white"><Plus className="h-4 w-4" /> Add {panelMeta[openPanel].title} Item</button>}
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title={`Edit ${panelMeta[editing.section].title}`} onClose={() => setEditing(null)}>
          <form onSubmit={saveItem} className="space-y-4">
            <label className="block"><span className="mb-1 block text-sm font-bold text-slate-700">Title</span><textarea required value={editing.item.title} onChange={(event) => setEditing({ ...editing, item: { ...editing.item, title: event.target.value } })} className="min-h-24 w-full rounded-xl border border-slate-300 p-3" /></label>
            <label className="block"><span className="mb-1 block text-sm font-bold text-slate-700">Subtitle / Details</span><textarea value={editing.item.subtitle} onChange={(event) => setEditing({ ...editing, item: { ...editing.item, subtitle: event.target.value } })} className="min-h-20 w-full rounded-xl border border-slate-300 p-3" /></label>
            <div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1 block text-sm font-bold text-slate-700">Date / Status</span><input value={editing.item.date} onChange={(event) => setEditing({ ...editing, item: { ...editing.item, date: event.target.value } })} className="w-full rounded-xl border border-slate-300 p-3" /></label><label><span className="mb-1 block text-sm font-bold text-slate-700">Dot Color</span><select value={editing.item.tone} onChange={(event) => setEditing({ ...editing, item: { ...editing.item, tone: event.target.value as BulletinItem["tone"] } })} className="w-full rounded-xl border border-slate-300 p-3"><option value="green">Green</option><option value="blue">Blue</option><option value="yellow">Yellow</option><option value="red">Red</option></select></label></div>
            <button className="w-full rounded-xl bg-[#5b9432] px-4 py-3 font-black text-white">Save to Bulletin Board</button>
          </form>
        </Modal>
      )}

      {showNotifications && <Modal title="Notifications" onClose={() => setShowNotifications(false)}><div className="space-y-3">{[...board.reminders, ...board.training].slice(0, 6).map((item) => <div key={item.id} className="rounded-xl bg-slate-50 p-3"><p className="font-black text-[#0b3158]">{item.title}</p><p className="mt-1 text-sm text-slate-500">{item.subtitle}</p></div>)}</div></Modal>}
      {showHelp && <Modal title="Help & Support" onClose={() => setShowHelp(false)}><p className="leading-7 text-slate-600">Use the Bulletin Board to review company announcements, reminders, policy updates, training due dates, recognition, and pinned notes. If something on the board looks incorrect, contact TCS leadership.</p></Modal>}
    </div>
  );
}

function BulletinNav({ href, icon, label, active = false }: { href?: string; icon: React.ReactNode; label: string; active?: boolean }) {
  const content = <><span className="[&>svg]:h-5 [&>svg]:w-5">{icon}</span><span className="whitespace-pre-line">{label}</span></>;
  const className = `mx-2 flex items-center gap-4 rounded-lg px-4 py-3.5 text-sm font-semibold ${active ? "bg-[#67a232] text-white shadow" : "text-white hover:bg-white/10"}`;
  return href ? <Link href={href} className={className}>{content}</Link> : <div className={className}>{content}</div>;
}

function StickyNote({ className, text, pin, small = false }: { className: string; text: React.ReactNode; pin: string; small?: boolean }) {
  return <div className={`absolute z-10 ${small ? "h-24 w-24" : "min-h-28 w-32"} ${className} hidden p-4 text-center font-serif text-[17px] italic leading-5 text-[#0b3158] shadow-lg md:block`}><span className={`absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full shadow ${pin === "green" ? "bg-[#5b9432]" : "bg-[#c79a17]"}`} />{text}</div>;
}

function BulletinPanel({ section, board, onOpen }: { section: Exclude<BoardSectionKey, "recognition" | "notes">; board: BulletinData; onOpen: (section: BoardSectionKey) => void }) {
  const meta = panelMeta[section];
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md"><div className={`flex items-center justify-between px-4 py-3 ${meta.tint}`}><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/60 text-[#0b3158]">{meta.icon}</span><h3 className="text-lg font-black text-[#0b3158]">{meta.title}</h3></div><button onClick={() => onOpen(section)} className="text-xs font-black text-[#15569e]">View All →</button></div><div>{board[section].slice(0, 3).map((item) => <button key={item.id} onClick={() => onOpen(section)} className="flex w-full items-start gap-3 border-t border-slate-100 px-4 py-2.5 text-left hover:bg-slate-50"><span className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${dotClass[item.tone]}`} /><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-[#0b3158]">{item.title}</strong><span className="mt-0.5 block truncate text-xs text-slate-500">{item.subtitle}</span></span><span className={`shrink-0 text-xs ${item.status ? "rounded-full bg-rose-100 px-2 py-1 font-bold text-red-600" : "text-slate-400"}`}>{item.date}</span></button>)}</div></section>;
}

function RecognitionPanel({ items, onOpen }: { items: BulletinItem[]; onOpen: () => void }) {
  const item = items[0];
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md"><div className="flex items-center justify-between bg-violet-100 px-4 py-3"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/60"><Star className="h-5 w-5" /></span><h3 className="text-lg font-black text-[#0b3158]">Employee Recognition</h3></div><button onClick={onOpen} className="text-xs font-black text-[#15569e]">View All →</button></div><button onClick={onOpen} className="flex w-full items-center gap-4 p-4 text-left"><span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-[#f6cb42] text-[#9a7111]"><Trophy className="h-10 w-10" /></span><span><strong className="text-lg text-[#0b3158]">{item?.title}</strong><span className="mt-2 block text-sm leading-5 text-[#315274]">{item?.subtitle}</span><span className="mt-2 block font-serif text-xl italic text-[#0b3158]">{item?.date}</span></span></button></section>;
}

function NotesPanel({ items, onOpen }: { items: BulletinItem[]; onOpen: () => void }) {
  const noteBg = { blue: "bg-sky-200", yellow: "bg-[#ffe169]", red: "bg-[#f4a2b4]", green: "bg-lime-200" } as const;
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md"><div className="flex items-center justify-between bg-amber-100 px-4 py-3"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/60"><Pin className="h-5 w-5" /></span><h3 className="text-lg font-black text-[#0b3158]">Pinned Notes</h3></div><button onClick={onOpen} className="text-xs font-black text-[#15569e]">View All →</button></div><button onClick={onOpen} className="grid w-full grid-cols-3 gap-3 p-4">{items.slice(0, 3).map((item, index) => <span key={item.id} className={`relative min-h-32 whitespace-pre-line p-3 text-center font-serif text-[16px] italic leading-5 text-[#0b3158] shadow-md ${noteBg[item.tone]} ${index === 0 ? "-rotate-3" : index === 2 ? "rotate-2" : ""}`}><span className="absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full bg-[#0b3158] shadow" />{item.title}</span>)}</button></section>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4" onMouseDown={onClose}><section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}><header className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-5"><h2 className="text-xl font-black text-[#0b3158]">{title}</h2><button onClick={onClose} className="rounded-xl p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button></header><div className="p-6">{children}</div></section></div>;
}
