"use client";

import "./timesheet-command.css";
import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  Mail,
  PenLine,
  Plus,
  RefreshCw,
  ScanLine,
  Search,
  Settings2,
  Signature,
  Truck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const COMMAND_TYPES = ["CCRC Stage 1", "CCRC Stage 2", "CCCC", "DCFS", "Respite"] as const;
type CommandType = (typeof COMMAND_TYPES)[number];
type CommandTypeValue = CommandType | "CCRC";

type CommandStage =
  | "Location Sign-Off"
  | "Dynasty Review"
  | "Personal Handoff"
  | "Jen + Danielle Fill Out"
  | "Scan & Send to Jennifer"
  | "Jennifer Email"
  | "Complete";

const STAGES: Array<{ key: CommandStage; title: string; helper: string }> = [
  { key: "Location Sign-Off", title: "Location Sign-Off", helper: "Assigned collector checks off each signed child form" },
  { key: "Dynasty Review", title: "Dynasty Review", helper: "Every timesheet accounted for and signed" },
  { key: "Personal Handoff", title: "Delivered to Jennifer", helper: "Dynasty personally hands the physical timesheets to Jennifer" },
  { key: "Jen + Danielle Fill Out", title: "Jen + Danielle Fill Out", helper: "Complete each form from the child certificate" },
  { key: "Scan & Send to Jennifer", title: "Scan & Send to Jen", helper: "Danielle or Anthony scans and sends to Jennifer" },
  { key: "Jennifer Email", title: "Jennifer Email", helper: "Jennifer sends to the correct department" },
  { key: "Complete", title: "Complete", helper: "Fully submitted and recorded" },
];

type RecordItem = {
  id: string;
  rowId: string;
  childName: string;
  familyName: string;
  servicePeriod: string;
  location: string;
  locationSlug: string;
  collector: string;
  timesheetType: CommandTypeValue;
  needsCcrcStage: boolean;
  stage: CommandStage;
  collectorSigned: boolean;
  collectorSignedAt: string;
  collectorSignedBy: string;
  collectorNotes: string;
  dynastyStatus: string;
  dynastyReviewedAt: string;
  dynastyReviewedBy: string;
  dynastyHandoffDate: string;
  dynastyHandedToJenniferAt: string;
  dynastyHandoffBy: string;
  certificateVerified: boolean;
  tuitionPolicyAcknowledged: boolean;
  completedBy: string;
  completedAt: string;
  scanQualityChecked: boolean;
  scannedBy: string;
  scannedAt: string;
  sentToJenniferAt: string;
  department: string;
  departmentEmail: string;
  attachmentConfirmed: boolean;
  emailedBy: string;
  emailedAt: string;
  notes: string;
  updatedAt: string;
};

type RouteConfig = { department: string; email: string; deadline: string; fileNameFormat: string };
type CollectorCard = { slug: string; location: string; collector: string };
type ActorCaps = {
  name: string;
  collectorSlug: string | null;
  canViewAll: boolean;
  canCreateBatch: boolean;
  canDynastyReview: boolean;
  canDynastyHandoff: boolean;
  canFillOut: boolean;
  canScan: boolean;
  canEmail: boolean;
  canManageRoutes: boolean;
};
type ApiData = {
  records: RecordItem[];
  routes: Record<CommandType, RouteConfig>;
  types: readonly CommandType[];
  collectors: CollectorCard[];
  actor: ActorCaps;
};

function formatStamp(value: string) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function currentServicePeriod() {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date());
}

function stageIndex(stage: CommandStage) {
  return STAGES.findIndex((item) => item.key === stage);
}

function stageTone(stage: CommandStage) {
  if (stage === "Complete") return "green";
  if (stage === "Jennifer Email") return "plum";
  if (stage === "Scan & Send to Jennifer") return "blue";
  if (stage === "Jen + Danielle Fill Out" || stage === "Personal Handoff") return "gold";
  if (stage === "Dynasty Review") return "red";
  return "";
}

export default function TimesheetCommandCenterPage() {
  const { session } = useAuth();
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<RecordItem | null>(null);
  const [showRoutes, setShowRoutes] = useState(false);
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("All Locations");
  const [typeFilter, setTypeFilter] = useState("All Types");
  const [periodFilter, setPeriodFilter] = useState(currentServicePeriod());

  const request = useCallback(async (method: "GET" | "POST", body?: Record<string, unknown>) => {
    if (!session?.access_token) throw new Error("Your staff session is not available yet.");
    const response = await fetch("/api/timesheets", {
      method,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const raw = await response.text();
    let payload: any = {};
    if (raw) {
      try { payload = JSON.parse(raw); } catch { payload = { error: raw }; }
    }
    if (!response.ok) throw new Error(payload.error || raw || "Timesheet Command Center request failed.");
    return payload;
  }, [session?.access_token]);

  const load = useCallback(async (quiet = false) => {
    if (!session?.access_token) return;
    if (!quiet) setLoading(true);
    setError("");
    try {
      const payload = await request("GET") as ApiData;
      setData(payload);
      setSelected((current) => current ? payload.records.find((record) => record.id === current.id) ?? null : null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the live timesheet database.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [request, session?.access_token]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function runAction(body: Record<string, unknown>, successText: string) {
    setSaving(true);
    setError("");
    try {
      await request("POST", body);
      setMessage(successText);
      window.setTimeout(() => setMessage(""), 2600);
      await load(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The change could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  const records = data?.records ?? [];
  const periods = useMemo(() => {
    const values = new Set([currentServicePeriod(), ...records.map((record) => record.servicePeriod).filter(Boolean)]);
    return [...values];
  }, [records]);

  const periodRecords = useMemo(() => records.filter((record) => periodFilter === "All Periods" || record.servicePeriod === periodFilter), [records, periodFilter]);
  const filtered = useMemo(() => periodRecords.filter((record) => {
    const locationMatch = locationFilter === "All Locations" || record.locationSlug === locationFilter;
    const typeMatch = typeFilter === "All Types" || record.timesheetType === typeFilter;
    const q = search.trim().toLowerCase();
    const searchMatch = !q || `${record.childName} ${record.familyName} ${record.location} ${record.timesheetType} ${record.stage}`.toLowerCase().includes(q);
    return locationMatch && typeMatch && searchMatch;
  }), [periodRecords, locationFilter, typeFilter, search]);

  const stats = useMemo(() => ({
    total: periodRecords.length,
    missing: periodRecords.filter((record) => !record.collectorSigned).length,
    review: periodRecords.filter((record) => record.stage === "Dynasty Review").length,
    handoff: periodRecords.filter((record) => record.stage === "Personal Handoff").length,
    fill: periodRecords.filter((record) => record.stage === "Jen + Danielle Fill Out").length,
    scan: periodRecords.filter((record) => record.stage === "Scan & Send to Jennifer").length,
    email: periodRecords.filter((record) => record.stage === "Jennifer Email").length,
    complete: periodRecords.filter((record) => record.stage === "Complete").length,
  }), [periodRecords]);

  const workflowCounts = useMemo(() => new Map(STAGES.map((stage) => [stage.key, periodRecords.filter((record) => record.stage === stage.key).length])), [periodRecords]);
  const collectorCards = data?.collectors ?? [];

  return (
    <MainLayout>
      <div className="tscc">
        <section className="tscc-shell">
          <header className="tscc-hero">
            <div className="tscc-hero-copy">
              <p className="tscc-kicker">Operations / Compliance / Children / Brighter Tomorrows</p>
              <h1>Timesheet Command Center</h1>
              <p className="tscc-subtitle">From signatures to submission — one controlled chain of custody</p>
              <div className="tscc-hero-actions">
                {data?.actor.canCreateBatch && <button className="tscc-btn primary" disabled={saving} onClick={() => void runAction({ action: "createBatch", servicePeriod: currentServicePeriod() }, `Current ${currentServicePeriod()} batch created from active subsidized children.`)}><Plus size={15}/> Create {currentServicePeriod()} Batch</button>}
                {data?.actor.canManageRoutes && <button className="tscc-btn" onClick={() => setShowRoutes(true)}><Settings2 size={15}/> Department Routing</button>}
                <button className="tscc-btn" disabled={loading} onClick={() => void load()}><RefreshCw size={15}/> Refresh Live Data</button>
              </div>
            </div>
            <div className="tscc-live-card">
              <div className="tscc-live-row"><strong>Live Database</strong><span className="tscc-live-dot" /></div>
              <small>Every checkoff, Dynasty review, personal handoff date, certificate completion, scan, and final email is written to the shared Supabase timesheet record and audit trail.</small>
            </div>
          </header>

          <div className="tscc-workflow-wrap">
            <div className="tscc-workflow">
              {STAGES.map((stage, index) => {
                const count = workflowCounts.get(stage.key) ?? 0;
                const done = stage.key === "Complete" && count > 0;
                const active = count > 0 && !done;
                return <div className={`tscc-step ${done ? "done" : active ? "active" : ""}`} key={stage.key}><div className="tscc-step-top"><span className="tscc-step-num">{done ? "✓" : index + 1}</span><strong>{stage.title}</strong></div><small>{stage.helper}<br/><b>{count}</b> currently here</small></div>;
              })}
            </div>
          </div>

          <div className="tscc-body">
            {(message || error) && <div className="tscc-alert"><span>{error ? `⚠ ${error}` : `✓ ${message}`}</span><button onClick={() => { setMessage(""); setError(""); }}><X size={14}/></button></div>}

            <section className="tscc-kpis">
              <Kpi label="Total Timesheets" value={stats.total} helper={periodFilter} />
              <Kpi label="Missing Sign-Off" value={stats.missing} helper="location follow-up" />
              <Kpi label="Waiting for Dynasty" value={stats.review} helper="accountability review" />
              <Kpi label="Ready for Handoff" value={stats.handoff} helper="personally to Jennifer" />
              <Kpi label="In Fill-Out" value={stats.fill} helper="Jennifer + Danielle" />
              <Kpi label="Waiting to Scan" value={stats.scan} helper="Danielle or Anthony" />
              <Kpi label="Waiting for Jennifer" value={stats.email} helper={`${stats.complete} complete`} />
            </section>

            <div className="tscc-grid">
              <section className="tscc-panel">
                <div className="tscc-panel-head"><div><h2>Location Collectors</h2><p>Each assigned person checks off every child whose physical timesheet has been signed.</p></div><span className="tscc-chip green"><Signature size={12}/> child-by-child</span></div>
                <div className="tscc-panel-body">
                  <div className="tscc-collectors">
                    {collectorCards.map((collector) => {
                      const rows = periodRecords.filter((record) => record.locationSlug === collector.slug);
                      const signed = rows.filter((record) => record.collectorSigned).length;
                      const pct = rows.length ? Math.round((signed / rows.length) * 100) : 0;
                      const canCollect = data?.actor.collectorSlug === collector.slug;
                      return <article className="tscc-collector" key={collector.slug}>
                        <div className="tscc-collector-title"><div><strong>{collector.collector}</strong><small>{collector.location}</small></div><span className="tscc-count">{signed}/{rows.length}</span></div>
                        <div className="tscc-progress"><i style={{ width: `${pct}%` }}/></div>
                        <div className="tscc-child-list">
                          {rows.length === 0 && <div className="tscc-empty">No timesheets for {periodFilter}.</div>}
                          {rows.map((record) => <div className="tscc-child" key={record.id}>
                            <input type="checkbox" aria-label={`Signed form for ${record.childName}`} checked={record.collectorSigned} disabled={!canCollect || saving || stageIndex(record.stage) > 1} onChange={(event) => void runAction({ action: "markSigned", id: record.id, signed: event.target.checked }, `${record.childName} ${event.target.checked ? "checked off as signed" : "returned to unsigned"}.`)} />
                            <div><span className="tscc-child-name">{record.childName}</span>{record.needsCcrcStage && <span className="tscc-needs-stage">CCRC stage still needs classification</span>}</div>
                            <select value={record.timesheetType === "CCRC" ? "" : record.timesheetType} disabled={saving || stageIndex(record.stage) >= 5} onChange={(event) => event.target.value && void runAction({ action: "setType", id: record.id, timesheetType: event.target.value }, `${record.childName} classified as ${event.target.value}.`)}><option value="">Choose type</option>{COMMAND_TYPES.map((type) => <option key={type}>{type}</option>)}</select>
                          </div>)}
                        </div>
                      </article>;
                    })}
                  </div>
                </div>
              </section>

              <section className="tscc-panel">
                <div className="tscc-panel-head"><div><h2>Timesheet Batches & Pipeline</h2><p>Track the five agency timesheet types through every step.</p></div><span className="tscc-chip gold"><ClipboardCheck size={12}/> {periodFilter}</span></div>
                <div className="tscc-panel-body tscc-table-wrap">
                  <table className="tscc-pipeline"><thead><tr><th>Type</th><th>Missing</th><th>Dynasty</th><th>Handoff</th><th>Fill</th><th>Scan</th><th>Email</th></tr></thead><tbody>
                    {COMMAND_TYPES.map((type) => {
                      const rows = periodRecords.filter((record) => record.timesheetType === type);
                      return <tr key={type}><td><strong>{type}</strong></td><td><span className="tscc-cell red">{rows.filter((r) => !r.collectorSigned).length}</span></td><td><span className="tscc-cell gold">{rows.filter((r) => r.stage === "Dynasty Review").length}</span></td><td><span className="tscc-cell gold">{rows.filter((r) => r.stage === "Personal Handoff").length}</span></td><td><span className="tscc-cell blue">{rows.filter((r) => r.stage === "Jen + Danielle Fill Out").length}</span></td><td><span className="tscc-cell green">{rows.filter((r) => r.stage === "Scan & Send to Jennifer").length}</span></td><td><span className="tscc-cell plum">{rows.filter((r) => r.stage === "Jennifer Email" || r.stage === "Complete").length}</span></td></tr>;
                    })}
                    {periodRecords.some((record) => record.timesheetType === "CCRC") && <tr><td><strong>CCRC — Needs Stage</strong></td><td><span className="tscc-cell red">{periodRecords.filter((r) => r.timesheetType === "CCRC").length}</span></td><td colSpan={5} style={{textAlign:"left",color:"#9a4d40",fontWeight:900}}>Choose Stage 1 or Stage 2 before final submission.</td></tr>}
                  </tbody></table>
                </div>
              </section>
            </div>

            <div className="tscc-grid">
              <QueuePanel title="Dynasty Review & Personal Handoff" helper="Dynasty verifies every form, then personally hands the batch to Jennifer — no third-party drop-off." icon={<Truck size={16}/>} rows={periodRecords.filter((record) => record.stage === "Dynasty Review" || record.stage === "Personal Handoff")} onOpen={setSelected} />
              <QueuePanel title="Jennifer + Danielle Completion" helper="Fill out every timesheet from the child certificate. Tuition is charged regardless of attendance." icon={<PenLine size={16}/>} rows={periodRecords.filter((record) => record.stage === "Jen + Danielle Fill Out")} onOpen={setSelected} />
            </div>

            <div className="tscc-grid">
              <QueuePanel title="Scan Queue" helper="Danielle or Anthony scans completed paperwork and sends the scan to Jennifer." icon={<ScanLine size={16}/>} rows={periodRecords.filter((record) => record.stage === "Scan & Send to Jennifer")} onOpen={setSelected} />
              <QueuePanel title="Jennifer Department Email Queue" helper="Jennifer is the final sender to the configured department for CCRC Stage 1, CCRC Stage 2, CCCC, DCFS, and Respite." icon={<Mail size={16}/>} rows={periodRecords.filter((record) => record.stage === "Jennifer Email")} onOpen={setSelected} />
            </div>

            <section className="tscc-panel tscc-records">
              <div className="tscc-panel-head"><div><h2>Master Timesheet Ledger</h2><p>Every child, location, type, current stage, and recorded handoff date in one place.</p></div><span className="tscc-chip blue"><FileCheck2 size={12}/> {filtered.length} showing</span></div>
              <div className="tscc-panel-body">
                <div className="tscc-toolbar">
                  <label style={{position:"relative"}}><Search size={14} style={{position:"absolute",left:11,top:12,color:"#8d7f73"}}/><input className="tscc-input" style={{paddingLeft:32}} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search child, family, location, type, or stage"/></label>
                  <select className="tscc-select" value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)}><option>All Periods</option>{periods.map((period) => <option key={period}>{period}</option>)}</select>
                  <select className="tscc-select" value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}><option>All Locations</option>{collectorCards.map((collector) => <option key={collector.slug} value={collector.slug}>{collector.location}</option>)}</select>
                </div>
                <div className="tscc-toolbar" style={{gridTemplateColumns:"180px 1fr",marginTop:8}}>
                  <select className="tscc-select" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option>All Types</option><option value="CCRC">CCRC — Needs Stage</option>{COMMAND_TYPES.map((type) => <option key={type}>{type}</option>)}</select>
                  <div />
                </div>
                <div className="tscc-table-wrap" style={{marginTop:9}}><table className="tscc-table"><thead><tr><th>Child</th><th>Location</th><th>Type</th><th>Stage</th><th>Signed</th><th>Dynasty</th><th>Handoff Date</th><th>Completed</th><th>Scanned</th><th>Email</th><th></th></tr></thead><tbody>
                  {filtered.map((record) => <tr key={record.id}><td><strong>{record.childName}</strong><br/><small>{record.familyName}</small></td><td>{record.location}</td><td>{record.timesheetType === "CCRC" ? <span className="tscc-chip red">Needs CCRC stage</span> : record.timesheetType}</td><td><span className={`tscc-chip ${stageTone(record.stage)}`}>{record.stage}</span></td><td>{record.collectorSigned ? "✓" : "—"}</td><td>{record.dynastyStatus}</td><td>{record.dynastyHandoffDate || "—"}</td><td>{record.completedBy || "—"}</td><td>{record.scannedBy || "—"}</td><td>{record.emailedBy || "—"}</td><td><button onClick={() => setSelected(record)}>Open Workflow</button></td></tr>)}
                  {!filtered.length && <tr><td colSpan={11}><div className="tscc-empty">No live timesheets match these filters.</div></td></tr>}
                </tbody></table></div>
              </div>
            </section>

            <footer className="tscc-footer">People • Process • Compliance • Brighter Tomorrows</footer>
          </div>
        </section>

        {loading && !data && <div className="tscc-modal-backdrop"><div className="tscc-modal" style={{maxWidth:420}}><div className="tscc-modal-body" style={{textAlign:"center",padding:35}}><RefreshCw className="animate-spin" style={{margin:"0 auto"}}/><h2 style={{marginTop:12}}>Loading the live timesheet database…</h2></div></div></div>}
        {selected && data && <RecordModal record={selected} actor={data.actor} routes={data.routes} saving={saving} onClose={() => setSelected(null)} onAction={runAction} />}
        {showRoutes && data && <RouteModal routes={data.routes} saving={saving} onClose={() => setShowRoutes(false)} onSave={(type, route) => runAction({ action: "saveRoute", timesheetType: type, ...route }, `${type} department routing saved.`)} />}
      </div>
    </MainLayout>
  );
}

function Kpi({ label, value, helper }: { label: string; value: number; helper: string }) {
  return <div className="tscc-kpi"><span>{label}</span><strong>{value}</strong><small>{helper}</small></div>;
}

function QueuePanel({ title, helper, icon, rows, onOpen }: { title: string; helper: string; icon: React.ReactNode; rows: RecordItem[]; onOpen: (record: RecordItem) => void }) {
  return <section className="tscc-panel"><div className="tscc-panel-head"><div><h2 style={{display:"flex",alignItems:"center",gap:7}}>{icon}{title}</h2><p>{helper}</p></div><span className="tscc-count" style={{background:"#e7d7c1",color:"#5c4639"}}>{rows.length}</span></div><div className="tscc-panel-body"><div className="tscc-queue">{rows.slice(0,8).map((record) => <div className="tscc-queue-row" key={record.id}><div><strong>{record.childName}</strong><span>{record.location} • {record.timesheetType}</span></div><button className="tscc-btn light" style={{minHeight:30}} onClick={() => onOpen(record)}>Open</button></div>)}{rows.length === 0 && <div className="tscc-empty">Nothing waiting here right now.</div>}{rows.length > 8 && <div className="tscc-empty">+ {rows.length - 8} more in the master ledger</div>}</div></div></section>;
}

function RecordModal({ record, actor, routes, saving, onClose, onAction }: { record: RecordItem; actor: ActorCaps; routes: Record<CommandType, RouteConfig>; saving: boolean; onClose: () => void; onAction: (body: Record<string, unknown>, successText: string) => Promise<void> }) {
  const [handoffDate, setHandoffDate] = useState(record.dynastyHandoffDate || new Date().toISOString().slice(0,10));
  const [certificateVerified, setCertificateVerified] = useState(record.certificateVerified);
  const [tuitionAck, setTuitionAck] = useState(record.tuitionPolicyAcknowledged);
  const [scanChecked, setScanChecked] = useState(record.scanQualityChecked);
  const step = stageIndex(record.stage);
  const route = record.timesheetType === "CCRC" ? null : routes[record.timesheetType];
  const canCollect = actor.collectorSlug === record.locationSlug;

  return <div className="tscc-modal-backdrop"><div className="tscc-modal">
    <div className="tscc-modal-head"><div><h2>{record.childName}</h2><p>{record.location} • {record.servicePeriod} • {record.stage}</p></div><button className="tscc-close" onClick={onClose}><X size={16}/></button></div>
    <div className="tscc-modal-body">
      <div className="tscc-stage-card current"><h3><FileCheck2 size={16}/> Timesheet Type</h3><p>CCRC forms must be classified as Stage 1 or Stage 2 before Jennifer can submit them.</p><div className="tscc-stage-actions"><select className="tscc-select" style={{maxWidth:230}} value={record.timesheetType === "CCRC" ? "" : record.timesheetType} disabled={saving || step >= 5} onChange={(event) => event.target.value && void onAction({ action:"setType", id:record.id, timesheetType:event.target.value }, `${record.childName} classified as ${event.target.value}.`)}><option value="">Choose timesheet type</option>{COMMAND_TYPES.map((type) => <option key={type}>{type}</option>)}</select>{record.needsCcrcStage && <span className="tscc-chip red"><AlertTriangle size={11}/> CCRC stage required</span>}</div></div>

      <StageCard number={1} title="Location Sign-Off" helper={`${record.collector} is assigned to get the form signed and check off this child.`} done={record.collectorSigned} current={step === 0} icon={<Signature size={16}/>}>
        <div className="tscc-stage-actions"><button className={`tscc-btn ${record.collectorSigned ? "light" : "green"}`} disabled={!canCollect || saving || step > 1} onClick={() => void onAction({ action:"markSigned", id:record.id, signed:!record.collectorSigned }, `${record.childName} ${record.collectorSigned ? "returned to unsigned" : "checked off as signed"}.`)}>{record.collectorSigned ? "Undo Signed Checkoff" : "✓ Check Off Signed Form"}</button><span className="tscc-chip">{record.collectorSignedAt ? formatStamp(record.collectorSignedAt) : "Not signed off yet"}</span></div>
      </StageCard>

      <StageCard number={2} title="Dynasty Review" helper="All timesheets go to Dynasty. She confirms every form is accounted for and signed." done={step > 1 || record.dynastyStatus === "Accounted For"} current={step === 1} icon={<ClipboardCheck size={16}/>}>
        <div className="tscc-stage-actions"><button className="tscc-btn red" disabled={!actor.canDynastyReview || saving || !record.collectorSigned} onClick={() => void onAction({ action:"dynastyReview", id:record.id, status:"Needs Correction" }, `${record.childName} returned to the location for correction.`)}>Needs Correction</button><button className="tscc-btn green" disabled={!actor.canDynastyReview || saving || !record.collectorSigned} onClick={() => void onAction({ action:"dynastyReview", id:record.id, status:"Accounted For" }, `${record.childName} accounted for by Dynasty.`)}>Accounted For + Signed</button><span className="tscc-chip">{record.dynastyReviewedAt ? formatStamp(record.dynastyReviewedAt) : record.dynastyStatus}</span></div>
      </StageCard>

      <StageCard number={3} title="Dynasty → Jennifer Personal Handoff" helper="Dynasty gives the physical timesheets directly to Jennifer. No third-party drop-off. The completion date is permanently recorded." done={step > 2} current={step === 2} icon={<Truck size={16}/>}>
        <div className="tscc-note" style={{marginBottom:9}}>PERSONAL HANDOFF ONLY — Dynasty to Jennifer.</div><div className="tscc-stage-actions"><input type="date" value={handoffDate} onChange={(event) => setHandoffDate(event.target.value)} disabled={!actor.canDynastyHandoff || saving}/><button className="tscc-btn primary" disabled={!actor.canDynastyHandoff || saving || record.dynastyStatus !== "Accounted For"} onClick={() => void onAction({ action:"dynastyHandoff", id:record.id, handoffDate }, `Personal handoff to Jennifer recorded for ${handoffDate}.`)}>Confirm Personal Handoff</button>{record.dynastyHandedToJenniferAt && <span className="tscc-chip green">Recorded {record.dynastyHandoffDate}</span>}</div>
      </StageCard>

      <StageCard number={4} title="Jennifer + Danielle Fill Out" helper="Use the child's certificate to complete the timesheet." done={step > 3} current={step === 3} icon={<PenLine size={16}/>}>
        <div className="tscc-tuition">Tuition is charged regardless of attendance.</div><div className="tscc-stage-actions" style={{marginTop:9}}><label className="tscc-check"><input type="checkbox" checked={certificateVerified} onChange={(event) => setCertificateVerified(event.target.checked)} disabled={!actor.canFillOut || saving}/><span>Child certificate reviewed and correct program/rates verified</span></label><label className="tscc-check"><input type="checkbox" checked={tuitionAck} onChange={(event) => setTuitionAck(event.target.checked)} disabled={!actor.canFillOut || saving}/><span>Tuition policy applied regardless of attendance</span></label><button className="tscc-btn primary" disabled={!actor.canFillOut || saving || !certificateVerified || !tuitionAck || !record.dynastyHandedToJenniferAt} onClick={() => void onAction({ action:"fillOut", id:record.id, certificateVerified, tuitionPolicyAcknowledged:tuitionAck }, `${record.childName} timesheet marked filled out from the certificate.`)}>Mark Timesheet Filled Out</button>{record.completedAt && <span className="tscc-chip green">{record.completedBy} • {formatStamp(record.completedAt)}</span>}</div>
      </StageCard>

      <StageCard number={5} title="Danielle or Anthony Scan + Send to Jennifer" helper="Scan all pages, confirm quality, then send the completed scan to Jennifer." done={step > 4} current={step === 4} icon={<ScanLine size={16}/>}>
        <div className="tscc-stage-actions"><label className="tscc-check"><input type="checkbox" checked={scanChecked} onChange={(event) => setScanChecked(event.target.checked)} disabled={!actor.canScan || saving}/><span>Scan is readable, upright, complete, and includes every page</span></label><button className="tscc-btn primary" disabled={!actor.canScan || saving || !scanChecked || !record.completedAt} onClick={() => void onAction({ action:"scan", id:record.id, scanQualityChecked:scanChecked }, `${record.childName} scanned and sent to Jennifer.`)}>Mark Scanned + Sent to Jen</button>{record.scannedAt && <span className="tscc-chip blue">{record.scannedBy} • {formatStamp(record.scannedAt)}</span>}</div>
      </StageCard>

      <StageCard number={6} title="Jennifer Emails Correct Department" helper="Jennifer is the final sender. Submission routing comes from the configured department for this timesheet type." done={record.stage === "Complete"} current={step === 5} icon={<Mail size={16}/>}>
        {record.timesheetType === "CCRC" ? <div className="tscc-note">Choose CCRC Stage 1 or CCRC Stage 2 first.</div> : <div className={`tscc-note`}><strong>{route?.department || "Department not configured"}</strong><br/>{route?.email || "Email not configured"}{route?.deadline ? ` • ${route.deadline}` : ""}</div>}
        <div className="tscc-stage-actions" style={{marginTop:9}}><button className="tscc-btn primary" disabled={!actor.canEmail || saving || !record.sentToJenniferAt || !route?.department || !route?.email} onClick={() => void onAction({ action:"email", id:record.id }, `${record.childName} marked emailed to the correct department by Jennifer.`)}>Mark Emailed to Department</button>{record.emailedAt && <span className="tscc-chip green">{record.emailedBy} • {formatStamp(record.emailedAt)}</span>}</div>
      </StageCard>

      {record.stage === "Complete" && <div className="tscc-stage-card done" style={{textAlign:"center"}}><CheckCircle2 size={28} style={{margin:"0 auto",color:"#2f7652"}}/><h3 style={{justifyContent:"center",marginTop:7}}>Timesheet Complete</h3><p>Signed, reviewed by Dynasty, personally handed to Jennifer, filled out from the certificate, scanned, returned to Jennifer, and emailed to the department.</p></div>}
    </div>
  </div></div>;
}

function StageCard({ number, title, helper, done, current, icon, children }: { number: number; title: string; helper: string; done: boolean; current: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return <section className={`tscc-stage-card ${done ? "done" : current ? "current" : ""}`}><h3><span className="tscc-step-num" style={{width:23,height:23,fontSize:9,background:done?"#347755":current?"#ad6a43":"#7e807b"}}>{done ? "✓" : number}</span>{icon}{title}</h3><p>{helper}</p>{children}</section>;
}

function RouteModal({ routes, saving, onClose, onSave }: { routes: Record<CommandType, RouteConfig>; saving: boolean; onClose: () => void; onSave: (type: CommandType, route: RouteConfig) => Promise<void> }) {
  const [draft, setDraft] = useState<Record<CommandType, RouteConfig>>(() => JSON.parse(JSON.stringify(routes)));
  return <div className="tscc-modal-backdrop"><div className="tscc-modal"><div className="tscc-modal-head"><div><h2>Department Email Routing</h2><p>Jennifer uses these live routes for final submission. No department or email is guessed.</p></div><button className="tscc-close" onClick={onClose}><X size={16}/></button></div><div className="tscc-modal-body"><div className="tscc-route-grid">{COMMAND_TYPES.map((type) => <section className="tscc-route-card" key={type}><h3>{type}</h3><label>Department<input value={draft[type].department} onChange={(event) => setDraft((current) => ({...current,[type]:{...current[type],department:event.target.value}}))} placeholder="Exact department name"/></label><label>Email<input type="email" value={draft[type].email} onChange={(event) => setDraft((current) => ({...current,[type]:{...current[type],email:event.target.value}}))} placeholder="Exact submission email"/></label><label>Deadline<input value={draft[type].deadline} onChange={(event) => setDraft((current) => ({...current,[type]:{...current[type],deadline:event.target.value}}))} placeholder="Optional deadline"/></label><label>File Name Format<input value={draft[type].fileNameFormat} onChange={(event) => setDraft((current) => ({...current,[type]:{...current[type],fileNameFormat:event.target.value}}))}/></label><button className="tscc-btn primary" style={{marginTop:9}} disabled={saving} onClick={() => void onSave(type,draft[type])}>Save {type} Route</button></section>)}</div></div></div></div>;
}
