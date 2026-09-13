"use client";

import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { ArrowRight, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

export default function ParentLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
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
    if (!normalized) return;

    setSending(true);
    setError("");
    setMessage("");
    try {
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: normalized,
        options: {
          emailRedirectTo: `${window.location.origin}/parent`,
          shouldCreateUser: true,
        },
      });
      if (signInError) throw signInError;
      setMessage("Check your email for a secure Parent Portal sign-in link. The link only opens records if that email is already on an active TCS child record.");
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : "Could not send the secure sign-in link.");
    } finally {
      setSending(false);
    }
  }

  return <main className="min-h-screen bg-gradient-to-br from-[#f5efe2] via-white to-[#eaf5ee] p-4 sm:p-8">
    <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-5xl items-center justify-center">
      <section className="grid w-full overflow-hidden rounded-[34px] border border-slate-200 bg-white shadow-2xl lg:grid-cols-[.9fr_1.1fr]">
        <div className="bg-gradient-to-br from-[#173d29] via-[#245a39] to-[#10291e] p-7 text-white sm:p-10">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10 text-xl font-black">TCS</div>
          <p className="mt-8 text-xs font-black uppercase tracking-[.18em] text-emerald-200">Family access</p>
          <h1 className="mt-2 text-4xl font-black">The Hub Parent Portal</h1>
          <p className="mt-4 text-sm font-semibold leading-7 text-emerald-50/80">See your child’s current attendance, schedule summary, transportation arrangement, recent daily-care updates, file follow-up items, and Parent Portal acknowledgment requests.</p>
          <div className="mt-8 space-y-3 text-sm font-semibold text-emerald-50/90">
            <p className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-5 w-5 flex-none text-emerald-200" />Access is matched to the verified guardian email already stored in your TCS family record.</p>
            <p className="flex items-start gap-2"><LockKeyhole className="mt-0.5 h-5 w-5 flex-none text-emerald-200" />A family cannot see another family’s children, messages, forms, or records.</p>
          </div>
        </div>

        <div className="p-7 sm:p-10">
          <p className="text-xs font-black uppercase tracking-[.18em] text-emerald-700">Secure email sign-in</p>
          <h2 className="mt-2 text-3xl font-black text-slate-950">Open your family portal</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">Enter the same email address your TCS location has on file for your family. We’ll email you a secure sign-in link—no password to remember.</p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <label className="block"><span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-500">Guardian email</span><div className="relative"><Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-3 text-sm font-semibold outline-none focus:border-emerald-400" /></div></label>
            <button disabled={sending} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#245a39] px-4 py-3 text-sm font-black text-white disabled:opacity-50">{sending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Email Secure Sign-In Link</button>
          </form>

          {message && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold leading-6 text-emerald-900">{message}</div>}
          {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-900">{error}</div>}

          <div className="mt-7 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600"><strong className="text-slate-900">Email not recognized?</strong> Ask your TCS location to confirm the guardian email stored in your child’s record. Creating an email login by itself does not grant access.</div>
        </div>
      </section>
    </div>
  </main>;
}
