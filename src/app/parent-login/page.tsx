"use client";

import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

export default function ParentLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/parent");
    });
  }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !isSupabaseConfigured) {
      setError("The secure Parent Portal connection is not configured.");
      return;
    }

    const normalized = email.trim().toLowerCase();
    if (!normalized || !password) return;

    setSigningIn(true);
    setError("");
    setMessage("");
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: normalized,
        password,
      });
      if (signInError) throw signInError;
      router.replace("/parent");
    } catch (caught) {
      setError("That email/password combination could not be signed in. If you were invited but have not created your account yet, open the invitation email first.");
    } finally {
      setSigningIn(false);
    }
  }

  async function forgotPassword() {
    if (!supabase || !isSupabaseConfigured) {
      setError("The secure Parent Portal connection is not configured.");
      return;
    }

    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      setError("Enter your Parent Portal email first, then choose Forgot Password.");
      return;
    }

    setSendingReset(true);
    setError("");
    setMessage("");
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalized, {
        redirectTo: `${window.location.origin}/parent/account-setup?mode=recovery`,
      });
      if (resetError) throw resetError;
      setMessage("If this email has an active Parent Portal account, a secure password-reset link has been sent.");
    } catch {
      setError("The password reset email could not be sent. Contact your TCS location if you need account help.");
    } finally {
      setSendingReset(false);
    }
  }

  return <main className="min-h-screen bg-gradient-to-br from-[#f5efe2] via-white to-[#eaf5ee] p-4 sm:p-8">
    <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-5xl items-center justify-center">
      <section className="grid w-full overflow-hidden rounded-[34px] border border-slate-200 bg-white shadow-2xl lg:grid-cols-[.9fr_1.1fr]">
        <div className="bg-gradient-to-br from-[#173d29] via-[#245a39] to-[#10291e] p-7 text-white sm:p-10">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10 text-xl font-black">TCS</div>
          <p className="mt-8 text-xs font-black uppercase tracking-[.18em] text-emerald-200">Family access</p>
          <h1 className="mt-2 text-4xl font-black">The Hub Parent Portal</h1>
          <p className="mt-4 text-sm font-semibold leading-7 text-emerald-50/80">Use the Parent Portal account you created from your TCS invitation to view the child information and features assigned specifically to you.</p>
          <div className="mt-8 space-y-3 text-sm font-semibold text-emerald-50/90">
            <p className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-5 w-5 flex-none text-emerald-200" />Parent accounts are invitation-only. TCS connects your verified email to specific children and permissions before access is granted.</p>
            <p className="flex items-start gap-2"><LockKeyhole className="mt-0.5 h-5 w-5 flex-none text-emerald-200" />You create and manage your own password. TCS staff cannot see it.</p>
          </div>
        </div>

        <div className="p-7 sm:p-10">
          <p className="text-xs font-black uppercase tracking-[.18em] text-emerald-700">Parent sign in</p>
          <h2 className="mt-2 text-3xl font-black text-slate-950">Welcome back</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">Enter the email and password you created when you accepted your Parent Portal invitation.</p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <label className="block"><span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-500">Email</span><div className="relative"><Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-3 text-sm font-semibold outline-none focus:border-emerald-400" /></div></label>

            <label className="block"><span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-500">Password</span><div className="relative"><LockKeyhole className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type={showPassword ? "text" : "password"} required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-11 text-sm font-semibold outline-none focus:border-emerald-400" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></label>

            <div className="flex justify-end"><button type="button" disabled={sendingReset} onClick={() => void forgotPassword()} className="text-xs font-black text-emerald-800 disabled:opacity-50">{sendingReset ? "Sending reset…" : "Forgot Password?"}</button></div>

            <button disabled={signingIn} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#245a39] px-4 py-3 text-sm font-black text-white disabled:opacity-50">{signingIn ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Sign In to Parent Portal</button>
          </form>

          {message && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold leading-6 text-emerald-900">{message}</div>}
          {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-900">{error}</div>}

          <div className="mt-7 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600"><strong className="text-slate-900">Don't have an account yet?</strong> Parent accounts cannot be created from this login screen. Your TCS location must send you an invitation first so the correct children and privacy permissions are connected to your account.</div>
        </div>
      </section>
    </div>
  </main>;
}
