"use client";

import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { AlertTriangle, Database, KeyRound, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const fieldClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [securityMessage, setSecurityMessage] = useState("");

  useEffect(() => {
    if (window.sessionStorage.getItem("tcs-security-timeout") === "1") {
      setSecurityMessage("For privacy, The Hub signed you out after 20 minutes without activity. Sign in again to continue.");
      window.sessionStorage.removeItem("tcs-security-timeout");
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setError("Supabase is not configured yet. Add the two values to .env.local first.");
      return;
    }

    if (!email.trim() || !password) {
      setError("Enter your email address and password.");
      return;
    }

    setIsSigningIn(true);
    setError("");

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setIsSigningIn(false);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-950 p-0 sm:p-8">
      <div className="min-h-[100dvh] w-full overflow-hidden bg-white shadow-2xl sm:min-h-0 sm:max-w-md sm:rounded-3xl sm:border sm:border-white/10">
        <div className="bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-950 px-6 pb-10 pt-[max(3rem,env(safe-area-inset-top))] text-center text-white sm:bg-emerald-50 sm:px-8 sm:py-7 sm:text-slate-950">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] border border-white/15 bg-white/10 text-white shadow-xl backdrop-blur sm:h-14 sm:w-14 sm:rounded-2xl sm:border-0 sm:bg-emerald-600 sm:shadow-lg sm:shadow-emerald-200">
            <LockKeyhole className="h-7 w-7" />
          </div>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-emerald-200 sm:mt-4 sm:text-emerald-700">
            TCS Operations Hub
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-2xl sm:text-slate-950">Welcome to The Hub</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm font-semibold leading-6 text-white/70 sm:text-slate-600">
            Secure access for Owner/Admin, Licensee, and Employee accounts invited through Team Access. Parent and family accounts are not active.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="-mt-5 space-y-5 rounded-t-[30px] bg-white px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-7 sm:mt-0 sm:rounded-none sm:px-8">
          {securityMessage && <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold leading-6 text-blue-900"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" /><p>{securityMessage}</p></div>}

          {!isSupabaseConfigured && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Supabase is not configured on this device yet. Complete FINAL-SETUP-GUIDE.md and restart the Hub before signing in.
              </p>
            </div>
          )}

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">
              Staff email
            </span>
            <span className="relative block">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={`${fieldClass} pl-10`}
                placeholder="you@example.com"
              />
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">
              Password
            </span>
            <span className="relative block">
              <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={`${fieldClass} pl-10`}
                placeholder="Your password"
              />
            </span>
          </label>

          {error && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSigningIn || !isSupabaseConfigured}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-emerald-100 transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSigningIn ? <LoaderCircle className="h-5 w-5 animate-spin" /> : isSupabaseConfigured ? <LockKeyhole className="h-5 w-5" /> : <Database className="h-5 w-5" />}
            {isSigningIn ? "Signing In…" : isSupabaseConfigured ? "Sign In" : "Setup Required"}
          </button>

          <p className="text-center text-xs leading-5 text-slate-500">
            Invited TCS staff only. Use the email and password you created from your invitation. Contact a TCS Owner/Admin if you need a new setup link or access change.
          </p>
        </form>
      </div>
    </main>
  );
}
