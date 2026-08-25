"use client";

import MainLayout from "@/components/layout/MainLayout";
import { PageIntro, PrimaryButton, SectionCard, StatCard, StatusBadge, inputClass } from "@/components/hub/HubUI";
import { useAuth } from "@/components/providers/AuthProvider";
import { careLocations } from "@/lib/location-config";
import {
  ACCESS_ROLES,
  DEFAULT_EMPLOYEE_PERMISSIONS,
  EMPLOYEE_PERMISSION_OPTIONS,
  ROLE_PERMISSION_SUMMARIES,
  type AccessRole,
  type TeamAccessAccount,
} from "@/lib/team-access";
import {
  AlertTriangle,
  Check,
  Clock3,
  KeyRound,
  LoaderCircle,
  Lock,
  MailPlus,
  PauseCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  UserCheck,
  UserCog,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type InviteForm = {
  full_name: string;
  email: string;
  role: AccessRole;
  locations: string[];
  permissions: string[];
};

const blankInvite: InviteForm = {
  full_name: "",
  email: "",
  role: "Employee",
  locations: ["Halcom"],
  permissions: [...DEFAULT_EMPLOYEE_PERMISSIONS],
};

function formatWhen(value: string | null) {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

export default function TeamAccessPage() {
  const { session, refreshProfile } = useAuth();
  const [accounts, setAccounts] = useState<TeamAccessAccount[]>([]);
  const [editing, setEditing] = useState<TeamAccessAccount | null>(null);
  const [invite, setInvite] = useState<InviteForm>(blankInvite);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [resendingId, setResendingId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const apiRequest = useCallback(async (url: string, options: RequestInit = {}) => {
    if (!session) throw new Error("Your staff session expired. Sign in again.");
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        ...(options.headers ?? {}),
      },
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "The request could not be completed.");
    return payload;
  }, [session]);

  const loadAccounts = useCallback(async (preferredId?: string) => {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      const payload = await apiRequest("/api/team-access", { method: "GET" });
      const next = (payload.accounts ?? []) as TeamAccessAccount[];
      setAccounts(next);
      const selected = next.find((account) => account.user_id === preferredId) ?? next[0] ?? null;
      setEditing(selected ? { ...selected, locations: [...selected.locations], permissions: [...selected.permissions] } : null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load team accounts.");
    } finally {
      setLoading(false);
    }
  }, [apiRequest, session]);

  useEffect(() => {
    const timeout = window.setTimeout(() => { void loadAccounts(); }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadAccounts]);

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3200);
  }

  function applyRole<T extends InviteForm | TeamAccessAccount>(record: T, role: AccessRole): T {
    return {
      ...record,
      role,
      locations: role === "Owner / Admin" ? ["All Locations"] : role === "Location Licensee" ? [record.locations.find((item) => item !== "All Locations") ?? "Halcom"] : record.locations.includes("All Locations") ? ["Halcom"] : record.locations.length ? record.locations : ["Halcom"],
      permissions: role === "Employee" ? (record.permissions.length ? record.permissions : [...DEFAULT_EMPLOYEE_PERMISSIONS]) : [],
    };
  }

  function toggleLocation<T extends InviteForm | TeamAccessAccount>(record: T, location: string): T {
    const role = record.role as AccessRole;
    if (role === "Owner / Admin") return { ...record, locations: ["All Locations"] };
    if (role === "Location Licensee") return { ...record, locations: [location] };
    const current = record.locations.filter((item) => item !== "All Locations");
    const next = current.includes(location) ? current.filter((item) => item !== location) : [...current, location];
    return { ...record, locations: next.length ? next : [location] };
  }

  function togglePermission<T extends InviteForm | TeamAccessAccount>(record: T, permission: string): T {
    const next = record.permissions.includes(permission)
      ? record.permissions.filter((item) => item !== permission)
      : [...record.permissions, permission];
    return { ...record, permissions: next };
  }

  async function sendInvitation() {
    setInviting(true);
    setError("");
    try {
      const payload = await apiRequest("/api/team-access/invite", {
        method: "POST",
        body: JSON.stringify(invite),
      });
      const invitation = payload.invitation as { user_id?: string; full_name?: string } | undefined;
      setInvite(blankInvite);
      await loadAccounts(invitation?.user_id);
      flash(`Invitation sent to ${invitation?.full_name ?? "the new staff member"}.`);
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : "The invitation could not be sent.");
    } finally {
      setInviting(false);
    }
  }

  async function saveAccess() {
    if (!editing) return;
    setSaving(true);
    setError("");
    try {
      const payload = await apiRequest("/api/team-access", {
        method: "PATCH",
        body: JSON.stringify({
          user_id: editing.user_id,
          full_name: editing.full_name,
          role: editing.role,
          locations: editing.locations,
          permissions: editing.permissions,
          is_active: editing.is_active,
        }),
      });
      if (payload.selfUpdated) await refreshProfile();
      await loadAccounts(editing.user_id);
      flash(`${editing.full_name}'s access was saved.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The account could not be updated.");
    } finally {
      setSaving(false);
    }
  }

  async function resendSetup(account: TeamAccessAccount) {
    setResendingId(account.user_id);
    setError("");
    try {
      const payload = await apiRequest("/api/team-access/resend", {
        method: "POST",
        body: JSON.stringify({ user_id: account.user_id }),
      });
      await loadAccounts(account.user_id);
      flash(`A new ${payload.sentAs === "password setup" ? "account setup" : "invitation"} email was sent to ${account.email}.`);
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : "The setup email could not be sent.");
    } finally {
      setResendingId("");
    }
  }

  const stats = useMemo(() => ({
    active: accounts.filter((account) => account.status === "Active").length,
    pending: accounts.filter((account) => account.status === "Invite Pending").length,
    paused: accounts.filter((account) => account.status === "Paused").length,
  }), [accounts]);

  const selectedRole = (editing?.role ?? "Employee") as AccessRole;

  return <MainLayout><div className="mx-auto max-w-[1480px] space-y-6">
    <PageIntro eyebrow="Owner/Admin controls" title="Team Access & Email Invitations" description="Danielle and Jennifer can invite every account by email, choose the role and location access, and pause or update access without creating users manually in Supabase." actions={<div className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-900"><ShieldCheck className="h-4 w-4" /> Owner/Admin Only</div>} />

    {error && <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
    {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">{notice}</div>}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Staff Accounts" value={accounts.length} icon={<Users className="h-5 w-5" />} />
      <StatCard label="Active" value={stats.active} icon={<UserCheck className="h-5 w-5" />} tone="blue" />
      <StatCard label="Invite Pending" value={stats.pending} icon={<Clock3 className="h-5 w-5" />} tone="amber" />
      <StatCard label="Paused" value={stats.paused} icon={<PauseCircle className="h-5 w-5" />} tone="slate" />
    </section>

    <SectionCard title="Invite a New Staff Member" description="They receive an email, click the secure link, create their own password, and enter the Hub with the access chosen here." action={<div className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white"><MailPlus className="h-4 w-4" /> Email Invite</div>}>
      <div className="grid gap-4 lg:grid-cols-3">
        <Field label="Full name"><input className={inputClass} value={invite.full_name} onChange={(event) => setInvite({ ...invite, full_name: event.target.value })} placeholder="Staff member’s name" /></Field>
        <Field label="Email address"><input type="email" className={inputClass} value={invite.email} onChange={(event) => setInvite({ ...invite, email: event.target.value })} placeholder="name@example.com" /></Field>
        <Field label="Account role"><select className={inputClass} value={invite.role} onChange={(event) => setInvite(applyRole(invite, event.target.value as AccessRole))}>{ACCESS_ROLES.map((role) => <option key={role}>{role}</option>)}</select></Field>
      </div>

      <LocationSelector role={invite.role} locations={invite.locations} onToggle={(location) => setInvite(toggleLocation(invite, location))} />
      {invite.role === "Employee" && <PermissionSelector permissions={invite.permissions} onToggle={(permission) => setInvite(togglePermission(invite, permission))} />}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <PrimaryButton onClick={() => void sendInvitation()} disabled={inviting}>{inviting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{inviting ? "Sending Invitation…" : "Send Invitation"}</PrimaryButton>
        <p className="text-xs leading-5 text-slate-500">Only the first Owner account is created during initial setup. Jennifer, future admins, Licensees, and Employees are invited here.</p>
      </div>
    </SectionCard>

    <div className="grid gap-6 xl:grid-cols-[.72fr_1.28fr]">
      <SectionCard title="Staff Accounts" description={loading ? "Loading secure accounts…" : "Choose an account to update its role, locations, permissions, or status."} action={<button onClick={() => void loadAccounts()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</button>}>
        <div className="space-y-3">
          {accounts.map((account) => <button key={account.user_id} onClick={() => setEditing({ ...account, locations: [...account.locations], permissions: [...account.permissions] })} className={`w-full rounded-2xl border p-4 text-left transition ${editing?.user_id === account.user_id ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:border-emerald-300"}`}>
            <div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-950">{account.full_name}</p><p className="mt-1 text-xs font-semibold text-slate-500">{account.email}</p></div><StatusBadge tone={account.status === "Active" ? "green" : account.status === "Invite Pending" ? "amber" : "red"}>{account.status}</StatusBadge></div>
            <p className="mt-3 text-sm font-black text-emerald-800">{account.role}</p>
            <p className="mt-1 text-xs text-slate-500">{account.locations.join(", ")}</p>
            <p className="mt-2 text-[11px] font-semibold text-slate-400">Last sign-in: {formatWhen(account.last_sign_in_at)}</p>
          </button>)}
          {!loading && !accounts.length && <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No staff accounts were found.</div>}
        </div>
      </SectionCard>

      {editing && <div className="space-y-6">
        <SectionCard title={`${editing.full_name}'s Access`} description="Changes take effect the next time this account loads or refreshes the Hub.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Staff name"><input className={inputClass} value={editing.full_name} onChange={(event) => setEditing({ ...editing, full_name: event.target.value })} /></Field>
            <Field label="Login email"><input className={inputClass} value={editing.email} readOnly /></Field>
            <Field label="Account status"><select className={inputClass} value={editing.is_active ? "Active" : "Paused"} onChange={(event) => setEditing({ ...editing, is_active: event.target.value === "Active" })}><option>Active</option><option>Paused</option></select></Field>
            <Field label="Role"><select className={inputClass} value={selectedRole} onChange={(event) => setEditing(applyRole(editing, event.target.value as AccessRole))}>{ACCESS_ROLES.map((role) => <option key={role}>{role}</option>)}</select></Field>
          </div>

          <LocationSelector role={selectedRole} locations={editing.locations} onToggle={(location) => setEditing(toggleLocation(editing, location))} />
          {selectedRole === "Employee" && <PermissionSelector permissions={editing.permissions} onToggle={(permission) => setEditing(togglePermission(editing, permission))} />}

          <div className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 sm:grid-cols-2">
            <p><strong className="text-slate-900">Invitation sent:</strong><br />{formatWhen(editing.invited_at)}</p>
            <p><strong className="text-slate-900">Account accepted:</strong><br />{formatWhen(editing.accepted_at)}</p>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <PrimaryButton onClick={() => void saveAccess()} disabled={saving}>{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{saving ? "Saving…" : "Save Access"}</PrimaryButton>
            {editing.status === "Invite Pending" && <button onClick={() => void resendSetup(editing)} disabled={resendingId === editing.user_id} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60">{resendingId === editing.user_id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Send New Setup Link</button>}
          </div>
        </SectionCard>

        <SectionCard title={`${selectedRole} Access`} description={selectedRole === "Employee" ? "Employee permissions are individually selected above." : "The standard access rules for this role."}>
          <div className="space-y-3">{ROLE_PERMISSION_SUMMARIES[selectedRole].map((permission) => <div key={permission} className="flex items-start gap-3 rounded-xl bg-slate-50 p-3"><div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800"><Check className="h-3.5 w-3.5" /></div><p className="text-sm font-bold leading-6 text-slate-700">{permission}</p></div>)}</div>
        </SectionCard>
      </div>}
    </div>

    <SectionCard title="Account Security" description="Invitations and administrative actions are protected on the server.">
      <div className="grid gap-4 md:grid-cols-3">
        <SecurityItem icon={<Send className="h-5 w-5" />} title="Email invitation" text="The invited person creates their own password. Danielle and Jennifer never need to know it." />
        <SecurityItem icon={<UserCog className="h-5 w-5" />} title="Role-controlled access" text="Owner/Admin, Licensee, and Employee access is assigned before the invitation is sent." />
        <SecurityItem icon={<Lock className="h-5 w-5" />} title="Server-only secret" text="The Supabase secret key stays on the server and is never included in the employee’s browser." />
      </div>
    </SectionCard>
  </div></MainLayout>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label><span className="mb-1.5 block text-sm font-black text-slate-700">{label}</span>{children}</label>;
}

function LocationSelector({ role, locations, onToggle }: { role: AccessRole; locations: string[]; onToggle: (location: string) => void }) {
  return <div className="mt-5"><p className="mb-2 text-sm font-black text-slate-700">Assigned locations</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{careLocations.map((location) => {
    const checked = role === "Owner / Admin" || locations.includes("All Locations") || locations.includes(location);
    return <label key={location} className={`flex items-center gap-3 rounded-xl border px-3 py-3 ${checked ? "border-emerald-300 bg-emerald-50" : "border-slate-200"}`}><input type={role === "Location Licensee" ? "radio" : "checkbox"} name={role === "Location Licensee" ? "licensee-location" : undefined} checked={checked} disabled={role === "Owner / Admin"} onChange={() => onToggle(location)} /><span className="text-sm font-black text-slate-700">{location}</span></label>;
  })}</div>{role === "Owner / Admin" && <p className="mt-2 text-xs font-semibold text-slate-500">Owner/Admin accounts automatically receive all locations.</p>}</div>;
}

function PermissionSelector({ permissions, onToggle }: { permissions: string[]; onToggle: (permission: string) => void }) {
  return <div className="mt-5"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-black text-slate-700">Employee permissions</p><p className="mt-1 text-xs text-slate-500">Turn on only the tools this employee needs for their job. KidKare and Timesheets are administrative-role tools and are never available to standard Employee accounts.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{permissions.length} selected</span></div><div className="mt-3 grid gap-3 md:grid-cols-2">{EMPLOYEE_PERMISSION_OPTIONS.map((item) => {
    const checked = permissions.includes(item.key);
    return <label key={item.key} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${checked ? "border-emerald-300 bg-emerald-50" : "border-slate-200 hover:border-slate-300"}`}><input className="mt-1" type="checkbox" checked={checked} onChange={() => onToggle(item.key)} /><span><span className="block text-sm font-black text-slate-900">{item.label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{item.description}</span></span></label>;
  })}</div></div>;
}

function SecurityItem({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">{icon}</div><p className="mt-3 font-black text-slate-950">{title}</p><p className="mt-1 text-sm leading-6 text-slate-600">{text}</p></div>;
}
