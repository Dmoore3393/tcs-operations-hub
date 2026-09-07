"use client";

import "./tour-board.css";
import Link from "next/link";
import { canAccessRoute, useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { usePersistentState } from "@/hooks/usePersistentState";
import { starterEnrollmentLeads } from "@/lib/admin-ops";
import {
  TOUR_BOARD_COLUMNS,
  latestTour,
  makeTourId,
  normalizeTourLead,
  type ContactMethod,
  type LeadActivity,
  type LeadSource,
  type TourBoardLead,
  type TourBoardStage,
  type TourRating,
  type TourVisit,
  type TourVisitStatus,
} from "@/lib/tour-board";
import {
  Bell,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FileText,
  Heart,
  Home,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  Search,
  Send,
  Settings,
  Sparkles,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

const programs = ["Infant", "Toddler", "Preschool", "Pre-K", "School Age", "Extended Hours", "Weekend Care", "Other"];
const ageGroups = ["Infant", "Toddler", "Preschool", "Pre-K", "School Age", "Multiple Children", "Other"];
const sources: LeadSource[] = ["Website", "Facebook", "Instagram", "Google", "Parent Referral", "Phone", "Text", "Walk-In", "Community Event", "Agency", "Other"];
const contactMethods: ContactMethod[] = ["Phone Call", "Text", "Email", "Website", "Facebook", "Instagram", "In Person", "Other"];

function nowLocal() {
  const date = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function todayKey() { return new Date().toISOString().slice(0, 10); }
function personInitials(value: string) {
  return value.replace(/Family$/i, "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "F";
}
function formatShortDate(value: string) {
  if (!value) return "Not set";
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined }).format(date);
}
function formatDateTime(value: string) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}
function isPastDue(value: string) {
  if (!value) return false;
  return value < todayKey();
}
function blankLead(location: string, staffName: string): TourBoardLead {
  const createdAt = new Date().toISOString();
  return normalizeTourLead({
    id: Date.now(), location, familyName: "", parentName: "", phone: "", email: "", childName: "", childAge: "", requestedCare: "", transportationNeeded: false,
    subsidy: "", stage: "New Inquiry", tourDate: "", followUpDate: "", assignedTo: staffName, notes: "", createdAt,
    programType: "", ageGroup: "", leadSource: "Other", inquiryMethod: "Other", preferredStartDate: "", contactedAt: "", nextAction: "Contact family",
    priority: "Normal", enrollmentPacketSentAt: "", enrolledAt: "", waitlistReason: "", declinedReason: "", updatedAt: createdAt, tourHistory: [],
    activity: [{ id: makeTourId("activity"), at: createdAt, kind: "Inquiry", by: staffName, note: "New childcare inquiry added to the Tour Board." }],
  } as any);
}

export default function TourBoardPage() {
  const { profile, user } = useAuth();
  const { location, setLocation, availableLocations } = useHubLocation();
  const staffName = profile?.full_name || profile?.email || user?.email || "TCS Team";
  const [storedLeads, setStoredLeads] = usePersistentState<TourBoardLead[]>("tcs-enrollment-pipeline-v1", starterEnrollmentLeads.map((item) => normalizeTourLead(item as any)));
  const leads = useMemo(() => storedLeads.map((item) => normalizeTourLead(item as any)), [storedLeads]);

  const [search, setSearch] = useState("");
  const [programFilter, setProgramFilter] = useState("All Programs");
  const [ageFilter, setAgeFilter] = useState("All Ages");
  const [statusFilter, setStatusFilter] = useState<"All Statuses" | TourBoardStage>("All Statuses");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [leadDraft, setLeadDraft] = useState<TourBoardLead | null>(null);
  const [detailLead, setDetailLead] = useState<TourBoardLead | null>(null);
  const [scheduleLead, setScheduleLead] = useState<TourBoardLead | null>(null);
  const [tourLead, setTourLead] = useState<TourBoardLead | null>(null);
  const [activityLead, setActivityLead] = useState<TourBoardLead | null>(null);
  const [activityKind, setActivityKind] = useState<"Reminder" | "Contact" | "Follow-Up">("Follow-Up");
  const [activityNote, setActivityNote] = useState("");
  const [notice, setNotice] = useState("");

  const [tourWhen, setTourWhen] = useState("");
  const [tourHost, setTourHost] = useState(staffName);
  const [tourScheduleNote, setTourScheduleNote] = useState("");

  const [tourStatus, setTourStatus] = useState<TourVisitStatus>("Completed");
  const [arrivalAt, setArrivalAt] = useState("");
  const [conductedBy, setConductedBy] = useState(staffName);
  const [tourRating, setTourRating] = useState<TourRating>("Good Fit");
  const [familyReaction, setFamilyReaction] = useState("");
  const [questionsConcerns, setQuestionsConcerns] = useState("");
  const [tourNotes, setTourNotes] = useState("");
  const [tourNextStep, setTourNextStep] = useState("");
  const [tourFollowUp, setTourFollowUp] = useState("");

  const allowed = canAccessRoute(profile, "/enrollment-pipeline");
  const scoped = useMemo(() => leads.filter((lead) => location === "All Locations" || lead.location === location), [leads, location]);
  const filtered = useMemo(() => scoped.filter((lead) => {
    const query = search.trim().toLowerCase();
    const queryMatch = !query || [lead.familyName, lead.parentName, lead.childName, lead.phone, lead.email, lead.requestedCare, lead.notes, lead.assignedTo, lead.leadSource].join(" ").toLowerCase().includes(query);
    const programMatch = programFilter === "All Programs" || lead.programType === programFilter || lead.requestedCare === programFilter;
    const ageMatch = ageFilter === "All Ages" || lead.ageGroup === ageFilter || lead.childAge === ageFilter;
    const statusMatch = statusFilter === "All Statuses" || lead.stage === statusFilter;
    return queryMatch && programMatch && ageMatch && statusMatch;
  }), [scoped, search, programFilter, ageFilter, statusFilter]);
  const selected = selectedId ? leads.find((lead) => lead.id === selectedId) ?? null : null;

  const allTours = scoped.flatMap((lead) => lead.tourHistory.map((tour) => ({ lead, tour })));
  const noShows = allTours.filter(({ tour }) => tour.status === "No Show").length;
  const lateTours = allTours.filter(({ tour }) => tour.status === "Completed" && tour.lateMinutes > 0).length;
  const overdueFollowUps = scoped.filter((lead) => !["Enrolled", "Waitlist", "Declined"].includes(lead.stage) && isPastDue(lead.followUpDate)).length;
  const toursToday = allTours.filter(({ tour }) => tour.status === "Scheduled" && tour.scheduledAt.slice(0, 10) === todayKey()).length;
  const touredFamilies = scoped.filter((lead) => lead.tourHistory.some((tour) => tour.status === "Completed")).length;
  const enrolledCount = scoped.filter((lead) => lead.stage === "Enrolled").length;
  const conversion = touredFamilies ? Math.round((enrolledCount / touredFamilies) * 100) : 0;

  const upcomingTours = allTours.filter(({ tour }) => tour.status === "Scheduled" && tour.scheduledAt >= nowLocal()).sort((a, b) => a.tour.scheduledAt.localeCompare(b.tour.scheduledAt)).slice(0, 6);
  const followUps = scoped.filter((lead) => lead.followUpDate && !["Enrolled", "Declined"].includes(lead.stage)).sort((a, b) => a.followUpDate.localeCompare(b.followUpDate)).slice(0, 6);
  const sourceCounts = useMemo(() => {
    const map = new Map<string, number>();
    scoped.forEach((lead) => map.set(lead.leadSource || "Other", (map.get(lead.leadSource || "Other") || 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [scoped]);

  function persistLead(updated: TourBoardLead) {
    const normalized = normalizeTourLead({ ...updated, updatedAt: new Date().toISOString() } as any);
    setStoredLeads((current) => {
      const rows = current.map((item) => normalizeTourLead(item as any));
      return rows.some((item) => item.id === normalized.id) ? rows.map((item) => item.id === normalized.id ? normalized : item) : [...rows, normalized];
    });
    setSelectedId(normalized.id);
    return normalized;
  }
  function activity(kind: LeadActivity["kind"], note: string): LeadActivity {
    return { id: makeTourId("activity"), at: new Date().toISOString(), kind, by: staffName, note };
  }
  function addActivityToLead(lead: TourBoardLead, kind: LeadActivity["kind"], note: string, stage?: TourBoardStage) {
    const updated = persistLead({ ...lead, stage: stage ?? lead.stage, activity: [...lead.activity, activity(kind, note)] });
    setNotice(`${updated.familyName}: ${note}`);
  }
  function saveLead() {
    if (!leadDraft?.familyName.trim() || !leadDraft.parentName.trim()) {
      setNotice("Family name and parent/guardian name are required.");
      return;
    }
    const exists = leads.some((item) => item.id === leadDraft.id);
    const draft = normalizeTourLead(leadDraft as any);
    const updated = exists ? draft : { ...draft, activity: [...draft.activity, activity("Inquiry", `Inquiry recorded from ${draft.leadSource} via ${draft.inquiryMethod}.`)] };
    persistLead(updated);
    setLeadDraft(null);
    setNotice(`${updated.familyName} saved to the Tour Board.`);
  }
  function openNewLead() {
    const defaultLocation = location === "All Locations" ? (availableLocations.find((item) => item !== "All Locations") || "Division") : location;
    setLeadDraft(blankLead(defaultLocation, staffName));
  }
  function openSchedule(lead: TourBoardLead) {
    setScheduleLead(lead); setTourWhen(lead.tourDate || ""); setTourHost(lead.assignedTo || staffName); setTourScheduleNote("");
  }
  function saveSchedule() {
    if (!scheduleLead || !tourWhen) { setNotice("Choose a tour date and time."); return; }
    const visit: TourVisit = { id: makeTourId(), scheduledAt: tourWhen, status: "Scheduled", lateMinutes: 0, conductedBy: tourHost || staffName, rating: "Not Rated", familyReaction: "", questionsConcerns: "", notes: tourScheduleNote, nextStep: "Complete the tour and record the outcome.", followUpDate: "", loggedAt: new Date().toISOString(), loggedBy: staffName };
    persistLead({ ...scheduleLead, stage: "Tour Scheduled", tourDate: tourWhen, assignedTo: tourHost || staffName, nextAction: "Tour scheduled", tourHistory: [...scheduleLead.tourHistory, visit], activity: [...scheduleLead.activity, activity("Tour", `Tour scheduled for ${formatDateTime(tourWhen)} with ${tourHost || staffName}.`)] });
    setScheduleLead(null); setNotice("Tour scheduled and added to the family history.");
  }
  function openTourOutcome(lead: TourBoardLead) {
    const visit = latestTour(lead);
    setTourLead(lead); setTourStatus("Completed"); setArrivalAt(visit?.scheduledAt || nowLocal()); setConductedBy(visit?.conductedBy || staffName); setTourRating("Good Fit"); setFamilyReaction(""); setQuestionsConcerns(""); setTourNotes(""); setTourNextStep(""); setTourFollowUp(lead.followUpDate || "");
  }
  function saveTourOutcome() {
    if (!tourLead) return;
    const base = latestTour(tourLead);
    const scheduledAt = base?.scheduledAt || tourLead.tourDate || nowLocal();
    let lateMinutes = 0;
    if (tourStatus === "Completed" && arrivalAt) {
      lateMinutes = Math.max(0, Math.round((new Date(arrivalAt).getTime() - new Date(scheduledAt).getTime()) / 60000));
    }
    const completedVisit: TourVisit = {
      id: base?.id || makeTourId(), scheduledAt, status: tourStatus, arrivalAt: tourStatus === "Completed" ? arrivalAt : undefined, lateMinutes,
      conductedBy: conductedBy || staffName, rating: tourStatus === "Completed" ? tourRating : "Not Rated", familyReaction, questionsConcerns, notes: tourNotes,
      nextStep: tourNextStep, followUpDate: tourFollowUp, loggedAt: new Date().toISOString(), loggedBy: staffName,
    };
    const otherTours = base ? tourLead.tourHistory.filter((item) => item.id !== base.id) : tourLead.tourHistory;
    const nextStage: TourBoardStage = tourStatus === "Completed" ? "Toured" : tourStatus === "No Show" ? "Follow-Up" : tourStatus === "Rescheduled" ? "Tour Scheduled" : "Follow-Up";
    const statusNote = tourStatus === "Completed"
      ? `Tour completed by ${completedVisit.conductedBy}${lateMinutes ? `; family arrived ${lateMinutes} minutes late` : "; family arrived on time"}. Rating: ${tourRating}.`
      : tourStatus === "No Show" ? `Tour no-show recorded for ${formatDateTime(scheduledAt)}.` : `Tour marked ${tourStatus.toLowerCase()}.`;
    persistLead({ ...tourLead, stage: nextStage, followUpDate: tourFollowUp, nextAction: tourNextStep || (tourStatus === "No Show" ? "Contact family to reschedule" : "Follow up after tour"), tourHistory: [...otherTours, completedVisit], activity: [...tourLead.activity, activity("Tour", statusNote)] });
    setTourLead(null); setNotice(statusNote);
  }
  function openActivity(lead: TourBoardLead, kind: "Reminder" | "Contact" | "Follow-Up") {
    setActivityLead(lead); setActivityKind(kind); setActivityNote(kind === "Reminder" ? `Tour reminder sent for ${formatDateTime(lead.tourDate)}.` : "");
  }
  function saveActivity() {
    if (!activityLead || !activityNote.trim()) return;
    const nextStage = activityKind === "Contact" && activityLead.stage === "New Inquiry" ? "Contacted" : activityKind === "Follow-Up" ? "Follow-Up" : activityLead.stage;
    const contactedAt = activityKind === "Contact" ? new Date().toISOString() : activityLead.contactedAt;
    persistLead({ ...activityLead, stage: nextStage, contactedAt, activity: [...activityLead.activity, activity(activityKind, activityNote.trim())] });
    setActivityLead(null); setActivityNote(""); setNotice(`${activityKind} logged.`);
  }
  function markPacketSent(lead: TourBoardLead) {
    const when = new Date().toISOString();
    persistLead({ ...lead, enrollmentPacketSentAt: when, nextAction: lead.nextAction || "Follow up on enrollment packet", activity: [...lead.activity, activity("Packet", "Enrollment packet sent/given to family.")] });
    setNotice(`${lead.familyName}: enrollment packet marked sent.`);
  }

  if (!allowed) return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#25171b",padding:20}}><section style={{maxWidth:520,background:"white",borderRadius:24,padding:32,textAlign:"center"}}><h1>Tour Board access is not enabled</h1><p>Ask an Owner/Admin to add the Tour Board permission if your job includes tours or enrollment follow-up.</p><Link href="/">Return to Dashboard</Link></section></main>;

  return <div className="tour-shell">
    <aside className="tour-sidebar">
      <div className="tour-brand"><div className="tour-brand-mark"><span>♡</span> The<br/>Hub</div><small>CHILDCARE OPERATIONS<br/>FOR A BRIGHTER TOMORROW</small></div>
      <nav className="tour-nav">
        <Link href="/"><Home/>Dashboard</Link><button className="active"><Heart/>Tour Board</button><Link href="/families"><Users/>Families & Enrollment</Link><Link href="/employee-bulletin"><MessageCircle/>Communications</Link><Link href="/scheduling"><CalendarDays/>Calendar</Link><Link href="/reports"><FileText/>Reports</Link><Link href="/files"><FileCheck2/>Parent Resources</Link><Link href="/settings"><Settings/>Settings</Link>
      </nav>
      <div className="tour-side-quote">Thriving<br/>Children.<br/>Stronger<br/>Tomorrows.<small>THE HUB<br/>CHILDCARE OPERATIONS</small></div>
    </aside>

    <div className="tour-main">
      <header className="tour-topbar"><label className="tour-global-search"><Search/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search families, notes, or keywords..."/></label><button className="tour-bell"><Bell/><span>{overdueFollowUps + toursToday}</span></button><div className="tour-user"><span className="tour-avatar">{personInitials(staffName)}</span><div><strong>{staffName}</strong><small>{profile?.role || "TCS Team"}</small></div></div></header>

      <section className="tour-hero"><div className="tour-hero-copy"><h1>THE HUB TOUR BOARD</h1><h2>Guide families from first interest to enrollment.</h2><div className="tour-hero-values"><span>♥ More Families</span><span>👥 Stronger Communities</span><span>☀ Brighter Futures</span></div></div><div className="tour-family-photo" aria-label="Childcare tour family"/><div className="tour-hero-note">TOURS<br/><b>Today.</b><br/>Families<br/><b>Tomorrow.</b> ♡</div></section>

      <section className="tour-tools">
        {notice&&<div style={{marginBottom:8,border:"1px solid #f0c4be",background:"#fff3ef",borderRadius:8,padding:"8px 10px",fontSize:11,fontWeight:800,display:"flex",justifyContent:"space-between"}}><span>{notice}</span><button style={{border:0,background:"transparent"}} onClick={()=>setNotice("")}><X size={14}/></button></div>}
        <div className="tour-filter-row"><select value={location} onChange={(e)=>setLocation(e.target.value as any)} disabled={availableLocations.length===1}>{availableLocations.map((item)=><option key={item}>{item}</option>)}</select><select value={programFilter} onChange={(e)=>setProgramFilter(e.target.value)}><option>All Programs</option>{programs.map(item=><option key={item}>{item}</option>)}</select><select value={ageFilter} onChange={(e)=>setAgeFilter(e.target.value)}><option>All Ages</option>{ageGroups.map(item=><option key={item}>{item}</option>)}</select><select value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value as any)}><option>All Statuses</option>{[...TOUR_BOARD_COLUMNS,"Declined" as const].map(item=><option key={item}>{item}</option>)}</select><label className="tour-search-leads"><Search size={15}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search leads..."/></label></div>
        <div className="tour-actions"><button className="tour-primary" onClick={openNewLead}><Plus/>Add New Lead</button><button className="tour-action" disabled={!selected} onClick={()=>selected&&openSchedule(selected)}><CalendarPlus/>Schedule Tour</button><button className="tour-action" disabled={!selected} onClick={()=>selected&&openActivity(selected,"Reminder")}><Send/>Send / Log Reminder</button><button className="tour-action" disabled={!selected} onClick={()=>selected&&openActivity(selected,"Follow-Up")}><Phone/>Log Follow-Up</button><button className="tour-action" disabled={!selected} onClick={()=>selected&&markPacketSent(selected)}><ClipboardCheck/>Enrollment Packet Sent</button>{selected&&<span style={{alignSelf:"center",fontSize:10,fontWeight:900,color:"#9b5551"}}>Selected: {selected.familyName}</span>}</div>
      </section>

      <section className="tour-kpi-strip"><div className="tour-kpi"><span>Tours Today</span><strong>{toursToday}</strong></div><div className="tour-kpi danger"><span>Tour No-Shows</span><strong>{noShows}</strong></div><div className="tour-kpi warn"><span>Late Tour Arrivals</span><strong>{lateTours}</strong></div><div className={`tour-kpi ${overdueFollowUps?"danger":"good"}`}><span>Overdue Follow-Ups</span><strong>{overdueFollowUps}</strong></div></section>

      <div className="tour-board-wrap"><section className="tour-board">{TOUR_BOARD_COLUMNS.map((column)=>{const rows=filtered.filter((lead)=>lead.stage===column);return <div className="tour-column" key={column}><div className="tour-col-head"><strong>{column}</strong><span className="tour-col-count">{rows.length}</span></div>{rows.length===0&&<div className="tour-empty">No families here right now.</div>}{rows.map((lead)=>{const recent=latestTour(lead);return <article className={`tour-card ${selectedId===lead.id?"selected":""}`} key={lead.id} onClick={()=>setSelectedId(lead.id)}><div className="tour-card-top"><div><h3>{lead.familyName || "Family name needed"}</h3>{lead.priority!=="Normal"&&<span className="tour-priority">★ {lead.priority}</span>}</div><span className="tour-initials">{personInitials(lead.familyName)}</span></div><div className="tour-card-meta"><span><UserRound/>{lead.childAge||lead.ageGroup||"Age not entered"}</span><span><MapPin/>{lead.location}</span><span><Users/>{lead.programType||lead.requestedCare||"Program not entered"}</span><span><CalendarDays/>{lead.preferredStartDate?`Start ${formatShortDate(lead.preferredStartDate)}`:"Start date not entered"}</span><span><Sparkles/>{lead.subsidy||"Funding not entered"}</span></div>{recent?.status==="No Show"&&<div className="tour-card-alert">⚠ No-show on {formatShortDate(recent.scheduledAt)}</div>}{recent?.status==="Completed"&&recent.lateMinutes>0&&<div className="tour-card-alert">⏱ Arrived {recent.lateMinutes} minutes late for latest tour</div>}{lead.followUpDate&&isPastDue(lead.followUpDate)&&!["Enrolled","Waitlist"].includes(lead.stage)&&<div className="tour-card-alert">Follow-up overdue since {formatShortDate(lead.followUpDate)}</div>}<div className="tour-card-bottom"><span className={`tour-chip ${column==="Enrolled"?"good":column==="Toured"?"good":column==="Tour Scheduled"?"warn":column==="Waitlist"?"purple":""}`}>{recent&&column==="Tour Scheduled"?`Tour ${formatShortDate(recent.scheduledAt)}`:column}</span><div style={{display:"flex",gap:4}}>{column==="Tour Scheduled"&&<button className="tour-chip good" onClick={(e)=>{e.stopPropagation();openTourOutcome(lead)}}>Record Tour</button>}<button className="tour-chip" onClick={(e)=>{e.stopPropagation();setDetailLead(lead);setSelectedId(lead.id)}}>Open</button></div></div></article>})}</div>})}</section></div>

      {statusFilter==="Declined"&&<div style={{padding:"0 15px 10px"}}><section className="tour-panel"><div className="tour-panel-title"><strong>Declined / Closed Leads</strong><span>{filtered.filter(l=>l.stage==="Declined").length}</span></div></section></div>}

      <section className="tour-bottom"><div className="tour-panel"><div className="tour-panel-title"><strong>📅 Upcoming Tours</strong><span>{upcomingTours.length} next</span></div><div className="upcoming-list">{upcomingTours.length===0&&<div className="tour-empty">No upcoming tours scheduled.</div>}{upcomingTours.map(({lead,tour})=><div className="upcoming-row" key={tour.id}><b>{formatShortDate(tour.scheduledAt)}</b><span><strong>{lead.familyName}</strong><br/>{formatDateTime(tour.scheduledAt)} • {lead.location} • {tour.conductedBy||"Unassigned"}</span></div>)}</div></div><div className="tour-panel"><div className="tour-panel-title"><strong>🏡 Tour Conversion</strong><span>{touredFamilies} toured</span></div><div className="conversion"><div className="conversion-ring" style={{"--conversion":`${conversion}%`} as any}><strong>{conversion}%</strong></div><div className="conversion-stats"><b>{scoped.length}</b>Total Leads<b>{enrolledCount}</b>Enrolled<b>{scoped.filter(l=>l.stage==="Follow-Up").length}</b>In Follow-Up</div></div></div><div className="tour-panel"><div className="tour-panel-title"><strong>📊 Lead Sources</strong><span>{scoped.length} leads</span></div><div className="source-ring"><div className="source-donut"/><div className="source-list">{sourceCounts.length===0&&<div>No source data yet.</div>}{sourceCounts.map(([source,count])=><div key={source}><span>{source}</span><b>{count}</b></div>)}</div></div></div><div className="tour-panel"><div className="tour-panel-title"><strong>📝 Notes & Follow-Ups</strong><span>{followUps.length} next</span></div><div className="follow-list">{followUps.length===0&&<div className="tour-empty">Nothing waiting for follow-up.</div>}{followUps.map((lead)=><div className="follow-row" key={lead.id}><b style={{color:isPastDue(lead.followUpDate)?"#c7433e":"#a86b14"}}>{formatShortDate(lead.followUpDate)}</b><span><strong>{lead.familyName}</strong><br/>{lead.nextAction||lead.notes||"Follow up with family"}</span></div>)}</div></div></section>
    </div>

    {leadDraft&&<ModalShell title={leads.some(item=>item.id===leadDraft.id)?"Update Family Lead":"Add New Childcare Lead"} subtitle="Capture every family who contacts TCS so no inquiry disappears." onClose={()=>setLeadDraft(null)} wide><div className="tour-form"><Field label="Location"><select value={leadDraft.location} onChange={(e)=>setLeadDraft({...leadDraft,location:e.target.value})}>{availableLocations.filter(item=>item!=="All Locations").map(item=><option key={item}>{item}</option>)}</select></Field><Field label="Pipeline status"><select value={leadDraft.stage} onChange={(e)=>setLeadDraft({...leadDraft,stage:e.target.value as TourBoardStage})}>{[...TOUR_BOARD_COLUMNS,"Declined" as const].map(item=><option key={item}>{item}</option>)}</select></Field><Field label="Family name"><input value={leadDraft.familyName} onChange={(e)=>setLeadDraft({...leadDraft,familyName:e.target.value})} placeholder="Patterson Family"/></Field><Field label="Parent / guardian"><input value={leadDraft.parentName} onChange={(e)=>setLeadDraft({...leadDraft,parentName:e.target.value})}/></Field><Field label="Phone"><input value={leadDraft.phone} onChange={(e)=>setLeadDraft({...leadDraft,phone:e.target.value})}/></Field><Field label="Email"><input type="email" value={leadDraft.email} onChange={(e)=>setLeadDraft({...leadDraft,email:e.target.value})}/></Field><Field label="Child name"><input value={leadDraft.childName} onChange={(e)=>setLeadDraft({...leadDraft,childName:e.target.value})}/></Field><Field label="Child age"><input value={leadDraft.childAge} onChange={(e)=>setLeadDraft({...leadDraft,childAge:e.target.value})} placeholder="3y 4m"/></Field><Field label="Program type"><select value={leadDraft.programType} onChange={(e)=>setLeadDraft({...leadDraft,programType:e.target.value})}><option value="">Choose program</option>{programs.map(item=><option key={item}>{item}</option>)}</select></Field><Field label="Age group"><select value={leadDraft.ageGroup} onChange={(e)=>setLeadDraft({...leadDraft,ageGroup:e.target.value})}><option value="">Choose age group</option>{ageGroups.map(item=><option key={item}>{item}</option>)}</select></Field><Field label="Lead source"><select value={leadDraft.leadSource} onChange={(e)=>setLeadDraft({...leadDraft,leadSource:e.target.value as LeadSource})}>{sources.map(item=><option key={item}>{item}</option>)}</select></Field><Field label="How they contacted us"><select value={leadDraft.inquiryMethod} onChange={(e)=>setLeadDraft({...leadDraft,inquiryMethod:e.target.value as ContactMethod})}>{contactMethods.map(item=><option key={item}>{item}</option>)}</select></Field><Field label="Funding / subsidy"><input value={leadDraft.subsidy} onChange={(e)=>setLeadDraft({...leadDraft,subsidy:e.target.value})} placeholder="CCRC, Crystal Stairs, Cash Pay, DCFS..."/></Field><Field label="Preferred start date"><input type="date" value={leadDraft.preferredStartDate} onChange={(e)=>setLeadDraft({...leadDraft,preferredStartDate:e.target.value})}/></Field><Field label="Assigned to"><input value={leadDraft.assignedTo} onChange={(e)=>setLeadDraft({...leadDraft,assignedTo:e.target.value})}/></Field><Field label="Priority"><select value={leadDraft.priority} onChange={(e)=>setLeadDraft({...leadDraft,priority:e.target.value as TourBoardLead["priority"]})}><option>Normal</option><option>Hot Lead</option><option>Urgent</option></select></Field><label className="tour-check"><input type="checkbox" checked={leadDraft.transportationNeeded} onChange={(e)=>setLeadDraft({...leadDraft,transportationNeeded:e.target.checked})}/>Transportation needed</label><Field label="Next action"><input value={leadDraft.nextAction} onChange={(e)=>setLeadDraft({...leadDraft,nextAction:e.target.value})} placeholder="Call Tuesday, send rate sheet..."/></Field><Field label="Follow-up date"><input type="date" value={leadDraft.followUpDate} onChange={(e)=>setLeadDraft({...leadDraft,followUpDate:e.target.value})}/></Field><Field label="Requested care / schedule" full><textarea value={leadDraft.requestedCare} onChange={(e)=>setLeadDraft({...leadDraft,requestedCare:e.target.value})} placeholder="Full day, after school, extended hours, days needed..."/></Field><Field label="General notes" full><textarea value={leadDraft.notes} onChange={(e)=>setLeadDraft({...leadDraft,notes:e.target.value})}/></Field>{leadDraft.stage==="Waitlist"&&<Field label="Waitlist reason" full><textarea value={leadDraft.waitlistReason} onChange={(e)=>setLeadDraft({...leadDraft,waitlistReason:e.target.value})}/></Field>}{leadDraft.stage==="Declined"&&<Field label="Why they did not enroll" full><textarea value={leadDraft.declinedReason} onChange={(e)=>setLeadDraft({...leadDraft,declinedReason:e.target.value})}/></Field>}</div><div className="tour-modal-actions"><button className="tour-cancel" onClick={()=>setLeadDraft(null)}>Cancel</button><button className="tour-save" onClick={saveLead}>Save Lead</button></div></ModalShell>}

    {scheduleLead&&<ModalShell title={`Schedule Tour • ${scheduleLead.familyName}`} subtitle="Every scheduled tour stays in the family's history, even if they reschedule or do not show." onClose={()=>setScheduleLead(null)}><div className="tour-form"><Field label="Tour date & time" full><input type="datetime-local" value={tourWhen} onChange={(e)=>setTourWhen(e.target.value)}/></Field><Field label="Who will give the tour" full><input value={tourHost} onChange={(e)=>setTourHost(e.target.value)} placeholder={staffName}/></Field><Field label="Scheduling notes" full><textarea value={tourScheduleNote} onChange={(e)=>setTourScheduleNote(e.target.value)} placeholder="Anything the tour host should know before the family arrives..."/></Field></div><div className="tour-modal-actions"><button className="tour-cancel" onClick={()=>setScheduleLead(null)}>Cancel</button><button className="tour-save" onClick={saveSchedule}>Schedule Tour</button></div></ModalShell>}

    {tourLead&&<ModalShell title={`How did the tour go? • ${tourLead.familyName}`} subtitle="Complete this right after the tour so the next person knows exactly what happened." onClose={()=>setTourLead(null)} wide><div className="tour-form"><Field label="Tour outcome"><select value={tourStatus} onChange={(e)=>setTourStatus(e.target.value as TourVisitStatus)}><option>Completed</option><option>No Show</option><option>Cancelled</option><option>Rescheduled</option></select></Field><Field label="Tour conducted by"><input value={conductedBy} onChange={(e)=>setConductedBy(e.target.value)}/></Field>{tourStatus==="Completed"&&<><Field label="Actual arrival time"><input type="datetime-local" value={arrivalAt} onChange={(e)=>setArrivalAt(e.target.value)}/></Field><Field label="Overall fit"><select value={tourRating} onChange={(e)=>setTourRating(e.target.value as TourRating)}><option>Excellent Fit</option><option>Good Fit</option><option>Needs Follow-Up</option><option>Not a Fit</option></select></Field><Field label="How did the family react?" full><textarea value={familyReaction} onChange={(e)=>setFamilyReaction(e.target.value)} placeholder="What did they like? Did they seem excited, unsure, ready to enroll?"/></Field><Field label="Questions / concerns they raised" full><textarea value={questionsConcerns} onChange={(e)=>setQuestionsConcerns(e.target.value)} placeholder="Transportation, hours, rates, behavior support, subsidy, availability..."/></Field></>}<Field label="Tour notes" full><textarea value={tourNotes} onChange={(e)=>setTourNotes(e.target.value)} placeholder={tourStatus==="No Show"?"Any contact attempts or context about the no-show...":"What happened during the tour?"}/></Field><Field label="Next step"><input value={tourNextStep} onChange={(e)=>setTourNextStep(e.target.value)} placeholder="Send enrollment packet, call tomorrow, reschedule..."/></Field><Field label="Follow-up date"><input type="date" value={tourFollowUp} onChange={(e)=>setTourFollowUp(e.target.value)}/></Field></div><div className="tour-modal-actions"><button className="tour-cancel" onClick={()=>setTourLead(null)}>Cancel</button><button className="tour-save" onClick={saveTourOutcome}>Save Tour Outcome</button></div></ModalShell>}

    {activityLead&&<ModalShell title={`${activityKind} • ${activityLead.familyName}`} subtitle="Keep a running contact history so anyone can pick up the family relationship." onClose={()=>setActivityLead(null)}><div className="tour-form"><Field label={`${activityKind} notes`} full><textarea value={activityNote} onChange={(e)=>setActivityNote(e.target.value)} placeholder="What was sent, said, promised, or decided?"/></Field></div><div className="tour-modal-actions"><button className="tour-cancel" onClick={()=>setActivityLead(null)}>Cancel</button><button className="tour-save" onClick={saveActivity}>Save {activityKind}</button></div></ModalShell>}

    {detailLead&&<ModalShell title={detailLead.familyName} subtitle={`${detailLead.parentName} • ${detailLead.phone || "No phone"} • ${detailLead.email || "No email"}`} onClose={()=>setDetailLead(null)} wide><div className="tour-detail-grid"><section className="tour-detail-box"><h3>Family Snapshot</h3><div className="tour-card-meta"><span><UserRound/>Child: {detailLead.childName||"Not entered"} • {detailLead.childAge||detailLead.ageGroup||"Age not entered"}</span><span><MapPin/>{detailLead.location}</span><span><Users/>{detailLead.programType||detailLead.requestedCare||"Program not entered"}</span><span><Sparkles/>{detailLead.subsidy||"Funding not entered"}</span><span><Phone/>{detailLead.phone||"No phone"}</span><span><Mail/>{detailLead.email||"No email"}</span></div><p style={{fontSize:11,lineHeight:1.5}}><b>Next action:</b> {detailLead.nextAction||"Not set"}<br/><b>Follow-up:</b> {detailLead.followUpDate?formatShortDate(detailLead.followUpDate):"Not set"}<br/><b>Enrollment packet:</b> {detailLead.enrollmentPacketSentAt?`Sent ${formatShortDate(detailLead.enrollmentPacketSentAt)}`:"Not marked sent"}</p><div className="tour-actions"><button className="tour-action" onClick={()=>{setLeadDraft(detailLead);setDetailLead(null)}}>Edit Lead</button><button className="tour-action" onClick={()=>{openSchedule(detailLead);setDetailLead(null)}}>Schedule Tour</button><button className="tour-action" onClick={()=>{openTourOutcome(detailLead);setDetailLead(null)}}>Record Tour</button><button className="tour-action" onClick={()=>{openActivity(detailLead,"Contact");setDetailLead(null)}}>Log Contact</button></div></section><section className="tour-detail-box"><h3>Tour History</h3><div className="tour-history">{detailLead.tourHistory.length===0&&<div className="tour-empty">No tours scheduled yet.</div>}{[...detailLead.tourHistory].sort((a,b)=>b.scheduledAt.localeCompare(a.scheduledAt)).map((tour)=><div className="tour-history-entry" key={tour.id}><strong>{tour.status} • {formatDateTime(tour.scheduledAt)}</strong><small>{tour.conductedBy?`Tour host: ${tour.conductedBy}`:"Host not assigned"}{tour.lateMinutes?` • ${tour.lateMinutes} min late`:""}</small>{tour.rating!=="Not Rated"&&<div>Fit: {tour.rating}</div>}{tour.familyReaction&&<div>Family reaction: {tour.familyReaction}</div>}{tour.questionsConcerns&&<div>Questions/concerns: {tour.questionsConcerns}</div>}{tour.notes&&<div>Notes: {tour.notes}</div>}{tour.nextStep&&<div>Next: {tour.nextStep}</div>}</div>)}</div></section><section className="tour-detail-box" style={{gridColumn:"1/-1"}}><h3>Complete Contact & Activity History</h3><div className="tour-history">{[...detailLead.activity].sort((a,b)=>b.at.localeCompare(a.at)).map((entry)=><div className="tour-history-entry" key={entry.id}><strong>{entry.kind} • {formatDateTime(entry.at)}</strong><small>{entry.by||"TCS Team"}</small><div>{entry.note}</div></div>)}</div></section></div></ModalShell>}
  </div>;
}

function ModalShell({ title, subtitle, onClose, wide = false, children }: { title: string; subtitle: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  return <div className="tour-modal-backdrop"><section className={`tour-modal ${wide?"wide":""}`}><button className="tour-close" onClick={onClose}><X size={17}/></button><h2>{title}</h2><p>{subtitle}</p>{children}</section></div>;
}
function Field({ label, full = false, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return <label className={`tour-field ${full?"full":""}`}><span>{label}</span>{children}</label>;
}
