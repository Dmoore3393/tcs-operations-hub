"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { supabase } from "@/lib/supabase/client";
import { AlertTriangle, CheckCircle2, KeyRound, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const fieldClass = "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100";

export default function AcceptInvitePage() {
  const router = useRouter();
  const { session, profile, refreshProfile, signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [complete, setComplete] = useState(false);

  async function finishSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session) {
      setError("The invitation session is missing. Open the newest invitation email and try again.");
      return;
    }
    if (password.length < 10) {
      setError("Create a password with at least 10 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setSaving(true);
    setError("");

    const { error: passwordError } = await supabase.auth.updateUser({ password });
    if (passwordError) {
      setError(passwordError.message);
      setSaving(false);
      return;
    }

    const response = await fetch("/api/team-access/accept", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "The account could not be activated.");
      setSaving(false);
      return;
    }

    await refreshProfile();
    setComplete(true);
    setSaving(false);
    window.setTimeout(() => {
      router.replace("/");
      router.refresh();
    }, 900);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-950 p-4 sm:p-8">
      <section className="w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl">
        <div className="bg-emerald-50 px-6 py-7 text-center sm:px-9">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-200">
            {complete ? <CheckCircle2 className="h-8 w-8" /> : <ShieldCheck className="h-8 w-8" />}
          </div>
          <p className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-emerald-700">TCS Operations Hub</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{complete ? "Account activated!" : "Create your staff account"}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{complete ? "Your secure login is ready. Opening the Hub now…" : "Finish the invitation by creating your own password."}</p>
        </div>

        {!complete && (
          <form onSubmit={finishSetup} className="space-y-5 px-6 py-7 sm:px-9">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start gap-3">
                <Mail className="mt-0.5 h-5 w-5 text-emerald-700" />
                <div>
                  <p className="font-black text-slate-950">{profile?.full_name || "Invited staff member"}</p>
                  <p className="mt-0.5 text-sm text-slate-600">{profile?.email || session?.user.email}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-900">{profile?.role}</span>
                    {(profile?.locations ?? []).map((location) => <span key={location} className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-600 ring-1 ring-slate-200">{location}</span>)}
                  </div>
                </div>
              </div>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">Create password</span>
              <span className="relative block">
                <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
                <input className={`${fieldClass} pl-10`} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 10 characters" />
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">Confirm password</span>
              <span className="relative block">
                <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
                <input className={`${fieldClass} pl-10`} type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter it again" />
              </span>
            </label>

            {error && <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

            <button type="submit" disabled={saving} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-emerald-100 transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
              {saving ? "Activating Account…" : "Create Account & Enter Hub"}
            </button>

            <button type="button" onClick={() => void signOut()} className="w-full text-center text-xs font-bold text-slate-500 hover:text-slate-800">This invitation is not for me</button>
            <p className="text-center text-xs leading-5 text-slate-500">Your access is limited by the role, locations, and permissions assigned by Danielle or Jennifer.</p>
          </form>
        )}
      </section>
    </main>
  );
}
