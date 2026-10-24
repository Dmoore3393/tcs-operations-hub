"use client";

import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { CheckCircle2, Clock3, LoaderCircle, LockKeyhole, LogOut, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type AccountStatus = {
  email?: string;
  hasActiveAccess?: boolean;
  activeCount?: number;
  pendingApprovalCount?: number;
  invitedCount?: number;
  suspendedCount?: number;
  state?: string;
  error?: string;
};

export default function ParentAccountPendingPage() {
  const router = useRouter();
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase || !isSupabaseConfigured) {
      setStatus({ error: "The secure Parent Portal connection is not configured." });
      setLoading(false);
      return;
    }

    const auth = supabase;
    let mounted = true;

    void auth.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      if (!data.session) {
        router.replace("/parent-login");
        return;
      }

      const response = await fetch("/api/parent/account-status", {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({})) as AccountStatus;

      if (!mounted) return;
      if (payload.hasActiveAccess && !payload.pendingApprovalCount) {
        router.replace("/parent");
        return;
      }

      setStatus(payload);
      setLoading(false);
    });

    return () => { mounted = false; };
  }, [router]);

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    router.replace("/parent-login");
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#f4f0e7] p-4"><div className="text-center"><LoaderCircle className="mx-auto h-9 w-9 animate-spin text-emerald-700" /><p className="mt-3 text-sm font-black text-slate-700">Checking your account status…</p></div></main>;
  }

  const pending = status?.pendingApprovalCount ?? 0;
  const hasActive = Boolean(status?.hasActiveAccess);

  return <main className="min-h-screen bg-gradient-to-br from-[#f5efe2] via-white to-[#eaf5ee] p-4 sm:p-8">
    <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-4xl items-center justify-center">
      <section className="w-full overflow-hidden rounded-[34px] border border-slate-200 bg-white shadow-2xl">
        <div className="bg-gradient-to-br from-[#173d29] via-[#245a39] to-[#10291e] p-7 text-white sm:p-10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[.18em] text-emerald-200">Parent Portal security</p>
              <h1 className="mt-2 text-4xl font-black">Account review in progress</h1>
              <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-emerald-50/80">Your login is created, but TCS staff must review your child connection and permissions before new child information is unlocked.</p>
            </div>
            <span className="grid h-14 w-14 flex-none place-items-center rounded-2xl bg-white/10"><ShieldCheck className="h-7 w-7" /></span>
          </div>
        </div>

        <div className="p-7 sm:p-10">
          {status?.error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-semibold leading-6 text-red-900">{status.error}</div> : <>
            <div className="flex items-start gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-amber-100 text-amber-800"><Clock3 className="h-5 w-5" /></span>
              <div>
                <h2 className="font-black text-amber-950">{pending > 0 ? "Waiting for staff approval" : "Account review required"}</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-amber-900">Before approval, TCS checks that the correct child, household, billing privacy, pickup permissions, medical access, documents, messaging, and other portal settings are assigned to your account.</p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <Step icon={<CheckCircle2 className="h-5 w-5" />} title="1. Invitation accepted" text="Your email and password are set." complete />
              <Step icon={<ShieldCheck className="h-5 w-5" />} title="2. TCS reviews access" text="Staff verifies your permissions and privacy settings." />
              <Step icon={<LockKeyhole className="h-5 w-5" />} title="3. Portal unlocks" text="Approved child information becomes available." />
            </div>

            {hasActive && <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold leading-6 text-emerald-950">You already have approved access to another child or record. You can open your existing Parent Portal now; the new pending access will appear only after staff approval.</div>}

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              {hasActive && <button onClick={() => router.replace("/parent")} className="flex-1 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white">Open My Approved Portal</button>}
              <button onClick={() => void signOut()} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-800"><LogOut className="h-4 w-4" />Sign Out</button>
            </div>

            <p className="mt-6 text-center text-xs font-semibold leading-5 text-slate-500">Signed in as {status?.email}. No pending child details are shown on this page while approval is incomplete.</p>
          </>}
        </div>
      </section>
    </div>
  </main>;
}

function Step({ icon, title, text, complete = false }: { icon: React.ReactNode; title: string; text: string; complete?: boolean }) {
  return <div className={`rounded-2xl border p-4 ${complete ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}><span className={`grid h-9 w-9 place-items-center rounded-xl ${complete ? "bg-emerald-700 text-white" : "bg-white text-slate-600"}`}>{icon}</span><h3 className="mt-3 text-sm font-black text-slate-950">{title}</h3><p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{text}</p></div>;
}
