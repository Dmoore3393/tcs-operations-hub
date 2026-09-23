import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Support | The Hub",
  description: "Support information for The Hub by Thomason Childcare Solutions.",
};

export default function SupportPage() {
  return <main className="min-h-screen bg-[#f8f3e5] px-4 py-10 text-slate-900">
    <article className="mx-auto max-w-4xl overflow-hidden rounded-[30px] border border-emerald-900/10 bg-white shadow-xl">
      <header className="bg-gradient-to-br from-[#0f172a] via-[#214d31] to-[#8a6416] px-6 py-8 text-white sm:px-10">
        <p className="text-xs font-black uppercase tracking-[.18em] text-emerald-200">The Hub • TCS Operations</p>
        <h1 className="mt-2 text-4xl font-black">Support</h1>
        <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-white/75">Help with staff access, app setup, notifications, and daily use of The Hub.</p>
      </header>

      <div className="space-y-6 px-6 py-8 sm:px-10">
        <section className="grid gap-4 md:grid-cols-2">
          <SupportCard title="Can’t sign in?" text="Make sure you are using the email address invited through TCS Team Access. If your account is paused, pending, or linked to the wrong lane, a TCS Owner/Admin can correct it." />
          <SupportCard title="Wrong location or permissions?" text="Your TCS lane and your Hub access are separate. The lane describes your actual job; the Hub access role controls which software tools and locations you can open." />
          <SupportCard title="Notifications not arriving?" text="Open App Setup from your user menu, enable notifications, and confirm notifications are allowed in the phone or browser settings. Installed web-app notifications require device permission." />
          <SupportCard title="Time Clock issue?" text="Refresh The Hub and confirm today’s published shift and selected work location. Actual clock-outs should still be recorded even when extra time needs leadership review." />
          <SupportCard title="Document upload issue?" text="Use a supported PDF or image file up to 15 MB. Sensitive documents are encrypted and stored privately; direct public storage links are not used." />
          <SupportCard title="Lost or shared device?" text="Sign out of The Hub when possible and notify a TCS Owner/Admin promptly so account access can be reviewed or paused." />
        </section>

        <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6">
          <h2 className="text-xl font-black text-emerald-950">Contact TCS Support</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-emerald-900">For account access, technical problems, or privacy questions, email <a className="font-black underline" href="mailto:thomasonchildcaresolutions@gmail.com">thomasonchildcaresolutions@gmail.com</a>. Include your name, work location, and a short description of the problem. Do not email passwords.</p>
        </section>

        <section className="rounded-3xl border border-slate-200 p-6">
          <h2 className="text-xl font-black">Before reporting a problem</h2>
          <ol className="mt-3 space-y-2 text-sm font-semibold leading-6 text-slate-700">
            <li>1. Confirm you have an internet connection.</li>
            <li>2. Close and reopen The Hub.</li>
            <li>3. Confirm you are signed into your own staff account.</li>
            <li>4. Note the page, time, and message shown on screen.</li>
            <li>5. If the issue involves a child or family record, do not include confidential details in an ordinary support email unless requested through an approved secure process.</li>
          </ol>
        </section>

        <footer className="flex flex-wrap gap-3 border-t border-slate-200 pt-6">
          <Link href="/privacy" className="rounded-xl bg-[#214d31] px-4 py-2.5 text-sm font-black text-white">Privacy Policy</Link>
          <Link href="/login" className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-black text-slate-700">Staff Login</Link>
        </footer>
      </div>
    </article>
  </main>;
}

function SupportCard({ title, text }: { title: string; text: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><h2 className="font-black text-slate-950">{title}</h2><p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{text}</p></div>;
}
