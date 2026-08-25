"use client";

import MainLayout from "@/components/layout/MainLayout";
import { PageIntro, PrimaryButton, SectionCard, StatusBadge, inputClass } from "@/components/hub/HubUI";
import { usePersistentState } from "@/hooks/usePersistentState";
import { recordAuditEvent } from "@/lib/audit";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { Bell, CloudCheck, DatabaseBackup, Download, FileClock, Lock, Save, Settings, ShieldCheck, Users } from "lucide-react";
import { useEffect, useState } from "react";

type HubSettings = {
  organization: string;
  phone: string;
  scheduleDeadline: string;
  transportationChangeDeadline: string;
  lateFee: string;
  symptomFreeHours: string;
  gracePeriod: string;
  noDropAfter: string;
  notifications: {
    scheduleReminder: boolean;
    missingFiles: boolean;
    ratioWarning: boolean;
    transportChanges: boolean;
    kidKareMissing: boolean;
    timesheetStuck: boolean;
  };
};

type RetentionPolicy = {
  id: string;
  document_type: string;
  retention_years: number;
  anchor_event: "upload_date" | "child_exit_date" | "incident_date" | "service_period_end";
  description: string;
  is_active: boolean;
  requires_legal_hold_check: boolean;
};

const starterSettings: HubSettings = {
  organization: "Thomason Childcare Solutions",
  phone: "(760) 382-5742",
  scheduleDeadline: "Friday at 6:00 PM",
  transportationChangeDeadline: "11:00 AM",
  lateFee: "$35",
  symptomFreeHours: "48",
  gracePeriod: "10 minutes",
  noDropAfter: "9:30 AM",
  notifications: { scheduleReminder: true, missingFiles: true, ratioWarning: true, transportChanges: true, kidKareMissing: true, timesheetStuck: true },
};

const backupTables = [
  "locations",
  "staff_access",
  "staff_invitations",
  "staff_location_assignments",
  "children",
  "child_schedules",
  "daily_care_entries",
  "weekly_menus",
  "meal_services",
  "shift_reports",
  "handoff_items",
  "incidents",
  "kidkare_enrollments",
  "timesheets",
  "timesheet_submission_routes",
  "transportation_routes",
  "retention_policies",
  "document_records",
  "hub_state",
  "audit_log",
] as const;

type SettingsTab = "General" | "Policies" | "Notifications" | "Privacy" | "Retention" | "Data";

export default function SettingsPage() {
  const [settings, setSettings] = usePersistentState<HubSettings>("tcs-settings", starterSettings);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<SettingsTab>("General");
  const [backupStatus, setBackupStatus] = useState("");
  const [migrationStatus, setMigrationStatus] = useState("");
  const [retentionStatus, setRetentionStatus] = useState("");
  const [retentionPolicies, setRetentionPolicies] = useState<RetentionPolicy[]>([]);
  const { profile } = useAuth();

  useEffect(() => {
    if (!supabase) return;
    void supabase
      .from("retention_policies")
      .select("id,document_type,retention_years,anchor_event,description,is_active,requires_legal_hold_check")
      .order("document_type")
      .then(({ data, error }) => {
        if (error) setRetentionStatus(`Could not load retention rules: ${error.message}`);
        else setRetentionPolicies((data ?? []) as RetentionPolicy[]);
      });
  }, []);

  function save() {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  async function saveRetentionPolicies() {
    if (!supabase) return;
    setRetentionStatus("Saving retention rules…");
    for (const policy of retentionPolicies) {
      const { error } = await supabase
        .from("retention_policies")
        .update({
          retention_years: policy.retention_years,
          anchor_event: policy.anchor_event,
          description: policy.description,
          is_active: policy.is_active,
          requires_legal_hold_check: policy.requires_legal_hold_check,
          updated_at: new Date().toISOString(),
        })
        .eq("id", policy.id);
      if (error) {
        setRetentionStatus(`Could not save ${policy.document_type}: ${error.message}`);
        return;
      }
    }
    setRetentionStatus("Retention rules saved. New uploads will use the active rule for their document type.");
  }

  async function migrateLegacyData() {
    if (!supabase) return;
    setMigrationStatus("Checking for older shared records…");
    const { data, error } = await supabase.rpc("migrate_tcs_legacy_state");
    if (error) {
      setMigrationStatus(`Migration check failed: ${error.message}`);
      return;
    }
    setMigrationStatus(`Migration complete: ${JSON.stringify(data)}`);
  }

  async function exportSharedData() {
    if (!supabase) return;
    setBackupStatus("Preparing encrypted-system backup archive…");
    const records: Record<string, unknown[]> = {};

    for (const table of backupTables) {
      const { data, error } = await supabase.from(table).select("*");
      if (error) {
        setBackupStatus(`Backup failed while reading ${table}: ${error.message}`);
        return;
      }
      records[table] = data ?? [];
    }

    await recordAuditEvent({
      action: "EXPORT",
      tableName: "system_backup",
      metadata: { tables: backupTables, exportedBy: profile?.full_name || profile?.email },
    });

    const payload = {
      organization: settings.organization,
      exportedAt: new Date().toISOString(),
      exportedBy: profile?.full_name || profile?.email,
      warning: "Contains private childcare operational data and encrypted-document metadata. Ciphertext files are not embedded.",
      records,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `tcs-hub-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setBackupStatus("Backup downloaded and export recorded in the immutable audit log.");
  }

  return (
    <MainLayout>
      <div className="mx-auto max-w-[1250px] space-y-6">
        <PageIntro eyebrow="System setup" title="Settings" description="Adjust organization details, operational policy defaults, notifications, privacy rules, retention, and secure shared data." actions={<PrimaryButton onClick={save}><Save className="h-4 w-4" /> {saved ? "Saved" : "Save Settings"}</PrimaryButton>} />

        <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          {(["General", "Policies", "Notifications", "Privacy", "Retention", "Data"] as const).map((item) => (
            <button key={item} onClick={() => setTab(item)} className={`rounded-xl px-4 py-2.5 text-sm font-bold ${tab === item ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{item}</button>
          ))}
        </div>

        {tab === "General" && (
          <SectionCard title="Organization Details" description="These values can be used on forms, notices, and reports">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Organization name" wide><input className={inputClass} value={settings.organization} onChange={(event) => setSettings({ ...settings, organization: event.target.value })} /></Field>
              <Field label="Main phone number"><input className={inputClass} value={settings.phone} onChange={(event) => setSettings({ ...settings, phone: event.target.value })} /></Field>
              <Field label="Default location"><select className={inputClass}><option>Moore Family Childcare • Halcom</option><option>The School Age Center • Division</option><option>All Locations</option></select></Field>
              <Field label="Timezone"><input className={inputClass} value="America/Los_Angeles" readOnly /></Field>
              <Field label="Date format"><select className={inputClass}><option>Month Day, Year</option><option>MM/DD/YYYY</option></select></Field>
            </div>
          </SectionCard>
        )}

        {tab === "Policies" && (
          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title="Schedule & Attendance" description="Defaults shown in reminders and planning tools">
              <div className="space-y-4">
                <Field label="Weekly schedule deadline"><input className={inputClass} value={settings.scheduleDeadline} onChange={(event) => setSettings({ ...settings, scheduleDeadline: event.target.value })} /></Field>
                <Field label="Transportation change deadline"><input className={inputClass} value={settings.transportationChangeDeadline} onChange={(event) => setSettings({ ...settings, transportationChangeDeadline: event.target.value })} /></Field>
                <Field label="Drop-off grace period"><input className={inputClass} value={settings.gracePeriod} onChange={(event) => setSettings({ ...settings, gracePeriod: event.target.value })} /></Field>
                <Field label="No drop-off after"><input className={inputClass} value={settings.noDropAfter} onChange={(event) => setSettings({ ...settings, noDropAfter: event.target.value })} /></Field>
              </div>
            </SectionCard>
            <SectionCard title="Fees & Health" description="Reference values only; final policies remain in the signed handbook">
              <div className="space-y-4">
                <Field label="Late / no-communication fee"><input className={inputClass} value={settings.lateFee} onChange={(event) => setSettings({ ...settings, lateFee: event.target.value })} /></Field>
                <Field label="Symptom-free return period (hours)"><input className={inputClass} value={settings.symptomFreeHours} onChange={(event) => setSettings({ ...settings, symptomFreeHours: event.target.value })} /></Field>
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><strong>Important:</strong> The Hub does not replace signed family handbooks, licensing requirements, medical instructions, or case-specific agreements.</div>
              </div>
            </SectionCard>
          </div>
        )}

        {tab === "Notifications" && (
          <SectionCard title="Notification Preferences" description="Choose which operational alerts should be emphasized">
            <div className="space-y-3">
              {[
                ["scheduleReminder", "Family schedule deadline", "Remind staff about Friday’s 6 PM deadline", Bell],
                ["missingFiles", "Missing and expiring files", "Surface child, employee, facility, and vehicle documents", ShieldCheck],
                ["ratioWarning", "Ratio warning", "Flag a planned time block that may need more coverage", Settings],
                ["transportChanges", "Transportation changes", "Highlight riders, school times, and route changes", Bell],
                ["kidKareMissing", "KidKare enrollment queue", "Flag any child not enrolled for every attending location", ShieldCheck],
                ["timesheetStuck", "Timesheet handoff delays", "Highlight forms waiting too long at a workflow step", Settings],
              ].map(([key, title, helper, Icon]) => {
                const typedKey = key as keyof HubSettings["notifications"];
                const IconComponent = Icon as typeof Bell;
                return (
                  <label key={String(key)} className="flex items-center gap-4 rounded-2xl border border-slate-200 p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><IconComponent className="h-5 w-5" /></div>
                    <div className="min-w-0 flex-1"><p className="font-black text-slate-900">{String(title)}</p><p className="mt-1 text-sm text-slate-500">{String(helper)}</p></div>
                    <input type="checkbox" checked={settings.notifications[typedKey]} onChange={(event) => setSettings({ ...settings, notifications: { ...settings.notifications, [typedKey]: event.target.checked } })} className="h-5 w-5" />
                  </label>
                );
              })}
            </div>
          </SectionCard>
        )}

        {tab === "Privacy" && (
          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title="Administrator Access" description="Danielle and Jennifer have Owner/Admin access; licensees and employees are location restricted">
              <div className="space-y-3">
                <PrivacyRow icon={<Users className="h-5 w-5" />} title="Owner/Admin control" status="Enabled" helper="Danielle and Jennifer manage invitations, roles, security, capacities, colors, and company-wide settings." />
                <PrivacyRow icon={<Lock className="h-5 w-5" />} title="Parent portal" status="Disabled" helper="No family accounts or family-facing feed exist in this build." />
                <PrivacyRow icon={<ShieldCheck className="h-5 w-5" />} title="Opening / closing reports" status="Never shared" helper="These internal reports cannot appear in a future family portal." />
              </div>
            </SectionCard>
            <SectionCard title="Sharing Rules" description="Hard boundaries for future Brightwheel-style features">
              <div className="space-y-3 text-sm leading-6 text-slate-700">
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4"><p className="font-black text-red-900">Internal reports cannot be family-facing.</p><p className="mt-1 text-red-800">Opening reports, closing reports, staff handoffs, work plans, and internal behavior discussions cannot be attached to a family update.</p></div>
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4"><p className="font-black text-blue-900">Daily care sharing is off for now.</p><p className="mt-1 text-blue-800">Meal, diaper, potty, and rest entries are employee-only until the separate parent portal is designed and approved.</p></div>
                <a href="/team-access" className="inline-flex items-center gap-2 font-black text-emerald-800">Open Team Access →</a>
              </div>
            </SectionCard>
          </div>
        )}

        {tab === "Retention" && (
          <SectionCard title="Encrypted Document Retention Rules" description="These active rules are applied before a form or medical card can be uploaded. Legal hold always blocks deletion.">
            <div className="space-y-4">
              {retentionPolicies.map((policy, index) => (
                <article key={policy.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div><p className="font-black text-slate-950">{policy.document_type}</p><p className="mt-1 text-xs font-semibold text-slate-500">Legal-hold check {policy.requires_legal_hold_check ? "required" : "not required"}</p></div>
                    <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={policy.is_active} onChange={(event) => setRetentionPolicies((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, is_active: event.target.checked } : item))} /> Active</label>
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-[180px_260px_1fr]">
                    <Field label="Retention years"><input type="number" min={0} max={50} className={inputClass} value={policy.retention_years} onChange={(event) => setRetentionPolicies((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, retention_years: Number(event.target.value) } : item))} /></Field>
                    <Field label="Retention clock starts"><select className={inputClass} value={policy.anchor_event} onChange={(event) => setRetentionPolicies((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, anchor_event: event.target.value as RetentionPolicy["anchor_event"] } : item))}><option value="upload_date">Upload date</option><option value="child_exit_date">Child exit date</option><option value="incident_date">Incident date</option><option value="service_period_end">Service period end</option></select></Field>
                    <Field label="Rule notes"><textarea className={`${inputClass} min-h-20`} value={policy.description} onChange={(event) => setRetentionPolicies((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))} /></Field>
                  </div>
                </article>
              ))}
              {!retentionPolicies.length && <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">Run the production database setup to load retention rules.</div>}
              <div className="flex flex-wrap items-center gap-3"><PrimaryButton onClick={() => void saveRetentionPolicies()}><FileClock className="h-4 w-4" /> Save Retention Rules</PrimaryButton>{retentionStatus && <p className="text-sm font-bold text-slate-600">{retentionStatus}</p>}</div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>Review before launch:</strong> these are company baselines. Danielle and Jennifer should confirm longer licensing, subsidy, CACFP, insurance, investigation, or legal-hold requirements before any destruction.</div>
            </div>
          </SectionCard>
        )}

        {tab === "Data" && (
          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title="Relational Shared Database" description="Operational records are stored separately and protected row by row">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><div className="flex items-center gap-3"><CloudCheck className="h-7 w-7 text-emerald-700" /><div><p className="font-black text-emerald-950">Location-scoped storage enabled</p><p className="text-sm text-emerald-800">Every location-owned record carries a location ID and is checked by Row Level Security.</p></div></div></div>
              <div className="mt-4 space-y-2 text-sm text-slate-600"><p>• Children, schedules, care logs, meals, reports, incidents, KidKare, timesheets, and routes use separate tables.</p><p>• Owners have company-wide access; licensees and employees are checked against assigned locations.</p><p>• Create, update, review, export, and deletion activity is written to an immutable audit log.</p><p>• Documents are encrypted before upload and direct browser access is blocked.</p></div>
              <button onClick={() => void migrateLegacyData()} className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-slate-200 p-4 text-left hover:bg-slate-50"><DatabaseBackup className="h-5 w-5 text-purple-700" /><div><p className="font-black text-slate-900">Migrate older Hub records</p><p className="text-sm text-slate-500">Moves any existing JSON collections into the new relational tables. Safe to run more than once.</p></div></button>
              {migrationStatus && <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">{migrationStatus}</p>}
            </SectionCard>
            <SectionCard title="Download Data Backup" description="Export all shared relational data and audit history as a JSON archive">
              <div className="space-y-4">
                <button onClick={() => void exportSharedData()} className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 p-4 text-left hover:bg-slate-50"><Download className="h-5 w-5 text-blue-700" /><div><p className="font-black text-slate-900">Download secure backup</p><p className="text-sm text-slate-500">Includes relational records, access records, configuration, document metadata, and audit history.</p></div></button>
                {backupStatus && <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">{backupStatus}</p>}
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><strong>Protect the download:</strong> it may contain private child, family, health, employee, and timesheet information. Store it only in an approved encrypted location.</div>
              </div>
            </SectionCard>
          </div>
        )}

        <div className="flex justify-end">{saved && <StatusBadge tone="green">Settings saved to shared database</StatusBadge>}</div>
      </div>
    </MainLayout>
  );
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "sm:col-span-2" : ""}><span className="mb-1.5 block text-sm font-bold text-slate-700">{label}</span>{children}</label>;
}

function PrivacyRow({ icon, title, status, helper }: { icon: React.ReactNode; title: string; status: string; helper: string }) {
  return <div className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">{icon}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-black text-slate-950">{title}</p><StatusBadge tone={status === "Disabled" || status === "Never shared" ? "slate" : "green"}>{status}</StatusBadge></div><p className="mt-1 text-sm leading-6 text-slate-500">{helper}</p></div></div>;
}
