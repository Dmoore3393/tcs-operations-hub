import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | The Hub",
  description: "Privacy policy for The Hub by Thomason Childcare Solutions.",
};

export default function PrivacyPage() {
  return <main className="min-h-screen bg-[#f8f3e5] px-4 py-10 text-slate-900">
    <article className="mx-auto max-w-4xl overflow-hidden rounded-[30px] border border-emerald-900/10 bg-white shadow-xl">
      <header className="bg-gradient-to-br from-[#214d31] to-[#102c20] px-6 py-8 text-white sm:px-10">
        <p className="text-xs font-black uppercase tracking-[.18em] text-emerald-200">Thomason Childcare Solutions</p>
        <h1 className="mt-2 text-4xl font-black">The Hub Privacy Policy</h1>
        <p className="mt-3 text-sm font-semibold text-white/75">Effective September 23, 2026</p>
      </header>

      <div className="space-y-8 px-6 py-8 text-sm leading-7 sm:px-10">
        <section>
          <h2 className="text-xl font-black">About The Hub</h2>
          <p className="mt-2 text-slate-700">The Hub is a private operations application used by Thomason Childcare Solutions and authorized staff to manage childcare operations, staffing, schedules, timekeeping, transportation, training, compliance, documents, communications, and related business workflows. Access is limited to authorized users and is controlled by role, assigned location, and job permissions.</p>
        </section>

        <section>
          <h2 className="text-xl font-black">Information The Hub may process</h2>
          <p className="mt-2 text-slate-700">Depending on a user’s authorization and the work being performed, The Hub may process staff account information, work schedules, time-clock events, training records, performance and coaching records, time-off requests, work assignments, notifications, and uploaded business documents. Authorized childcare operations may also include child and family records such as enrollment information, emergency contacts, attendance, schedules, transportation information, care notes, health or allergy alerts, immunization information, incident records, subsidy records, and signed forms.</p>
        </section>

        <section>
          <h2 className="text-xl font-black">How information is used</h2>
          <p className="mt-2 text-slate-700">Information is used to operate childcare programs, supervise and schedule staff, support safe child care and transportation, maintain required records, administer training and workforce processes, communicate operational information, document approvals and acknowledgments, support billing and subsidy workflows, and maintain security and audit history.</p>
        </section>

        <section>
          <h2 className="text-xl font-black">Access and sharing</h2>
          <p className="mt-2 text-slate-700">The Hub is not designed to sell personal information or provide it to advertisers. Access inside The Hub is limited according to TCS role and location permissions. Information may be processed by service providers that host or operate the application and its secure infrastructure, and may be disclosed when required for lawful childcare, employment, regulatory, licensing, safety, or legal obligations.</p>
        </section>

        <section>
          <h2 className="text-xl font-black">Security</h2>
          <p className="mt-2 text-slate-700">TCS uses authenticated staff accounts, role and location restrictions, private server-side workflows, audit logging, session controls, and encrypted document storage. Sensitive uploaded documents are stored in a private bucket and are encrypted before storage. No security system can guarantee absolute protection, so access should only be used on trusted devices and credentials must not be shared.</p>
        </section>

        <section>
          <h2 className="text-xl font-black">Notifications and device features</h2>
          <p className="mt-2 text-slate-700">If a user enables notifications, The Hub may register that device to receive operational alerts. Users can control notification permission through their device or browser settings. Camera or file access is used only when the user chooses to capture or upload a document or image. The current Time Clock uses the selected TCS work location and does not require continuous GPS tracking.</p>
        </section>

        <section>
          <h2 className="text-xl font-black">Retention</h2>
          <p className="mt-2 text-slate-700">Records are retained according to TCS operational, licensing, employment, subsidy, and legal requirements. Certain secured documents have retention dates and legal-hold protections that prevent early deletion. Retention periods may differ by record type.</p>
        </section>

        <section>
          <h2 className="text-xl font-black">Account and privacy requests</h2>
          <p className="mt-2 text-slate-700">Authorized users who need help with account access, correction of their staff information, privacy questions, or a request concerning information associated with their account should contact a TCS Owner/Admin. Requests involving child or family records are handled according to applicable authorization, custody, licensing, and record-retention requirements.</p>
        </section>

        <section>
          <h2 className="text-xl font-black">Contact</h2>
          <p className="mt-2 text-slate-700">Privacy or support questions may be sent to <a className="font-black text-emerald-800 underline" href="mailto:thomasonchildcaresolutions@gmail.com">thomasonchildcaresolutions@gmail.com</a>.</p>
        </section>

        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <p className="font-black">Policy updates</p>
          <p className="mt-1">TCS may update this policy when The Hub’s features, service providers, legal requirements, or data practices change. The effective date above will be updated when material changes are published.</p>
        </section>

        <footer className="flex flex-wrap gap-3 border-t border-slate-200 pt-6">
          <Link href="/support" className="rounded-xl bg-[#214d31] px-4 py-2.5 font-black text-white">Support</Link>
          <Link href="/login" className="rounded-xl border border-slate-300 px-4 py-2.5 font-black text-slate-700">Staff Login</Link>
        </footer>
      </div>
    </article>
  </main>;
}
