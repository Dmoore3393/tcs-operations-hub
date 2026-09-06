"use client";

import { Bus, FileText, Printer, ShieldCheck, X } from "lucide-react";

export default function TransportationConsentForm({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-950/70 p-3 sm:p-6">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .consent-print-root, .consent-print-root * { visibility: visible !important; }
          .consent-print-root { position: absolute !important; inset: 0 !important; width: 100% !important; background: white !important; }
          .consent-controls { display: none !important; }
          .consent-page { box-shadow: none !important; margin: 0 !important; border: 0 !important; border-radius: 0 !important; break-after: page; page-break-after: always; }
          .consent-page:last-child { break-after: auto; page-break-after: auto; }
          input, textarea { background: transparent !important; }
          @page { size: letter; margin: 0.32in; }
        }
      `}</style>

      <div className="consent-print-root mx-auto max-w-[900px]">
        <div className="consent-controls sticky top-2 z-20 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-3 shadow-2xl ring-1 ring-slate-200">
          <div>
            <p className="text-xs font-black uppercase tracking-[.16em] text-[#1769d2]">Transportation Consent Forms</p>
            <p className="text-sm font-semibold text-slate-500">2026-2027 • Fill in the form, then print or save as PDF.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-[#1769d2] px-4 py-3 text-sm font-black text-white"><Printer className="h-4 w-4" /> PRINT / SAVE PDF</button>
            <button onClick={onClose} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700"><X className="h-4 w-4" /> CLOSE</button>
          </div>
        </div>

        <ConsentPage page="1 of 4">
          <ConsentHeader />
          <div className="grid gap-3 sm:grid-cols-[1fr_170px]">
            <Field label="Child's Full Name" />
            <Field label="DOB" />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Grade (2026-2027)" />
            <Field label="Teacher (Optional)" />
          </div>
          <div className="mt-3"><Field label="Name of School" /></div>
          <div className="mt-3"><Field label="Address of School" /></div>

          <Box title="LOCATION INFORMATION" icon="📍" className="mt-5">
            <div className="grid gap-3 sm:grid-cols-[1fr_190px]">
              <Field label="Child Care Location (Center Name)" />
              <Field label="Facility Number" />
            </div>
            <div className="mt-3"><Field label="Location Address" /></div>
            <div className="mt-3"><Field label="Transportation Route (If applicable)" /></div>
          </Box>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Box title="TRANSPORTATION DETAILS" icon="🏫">
              <p className="text-xs font-black text-slate-700">Transportation Needed (Check One):</p>
              <div className="mt-2 space-y-2"><Check label="AM Drop-Off To School" /><Check label="PM Pick-up From School" /><Check label="Both AM & PM" /></div>
              <div className="my-4 border-t border-dashed border-slate-300" />
              <p className="text-xs font-black text-slate-700">Authorized Pickup/Drop-Off Days:</p>
              <div className="mt-2 flex flex-wrap gap-3">{["Mon","Tue","Wed","Thu","Fri"].map((day) => <Check key={day} label={day} compact />)}</div>
            </Box>

            <Box title="TRANSPORTATION INFORMATION" icon="📍">
              <Field label="Child's Home Address" />
              <div className="mt-3 space-y-2"><TimeField label="School Start Time" /><TimeField label="School Dismissal Time" /><TimeField label="Minimum Day Dismissal Time" /></div>
              <div className="mt-3"><Field label="Parent's Preferred Contact #" /></div>
              <p className="mt-4 text-xs font-black text-slate-700">Emergency Contact During Transportation:</p>
              <div className="mt-2"><Field label="Name" /></div>
              <div className="mt-2"><Field label="Phone Number" /></div>
            </Box>
          </div>

          <Box title="SAFETY & SEATING OPTIONS" icon="🛡️" className="mt-4">
            <p className="text-xs font-black uppercase text-slate-600">Please check the boxes that apply below:</p>
            <div className="mt-2 space-y-2">
              <Check label="My child requires a booster seat." />
              <Check label="My child requires a 5-point harness." />
              <Check label="I authorize my child to ride in the front passenger seat when permitted by California law and at the discretion of The School Shuttle staff." />
            </div>
            <div className="mt-3 max-w-xs"><Field label="Parent/Guardian Initials" highlight /></div>
            <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_235px]">
              <div>
                <p className="text-xs font-black text-[#102a56]">BOOSTER SEAT POLICY:</p>
                <p className="mt-1 text-[11px] font-semibold leading-5 text-slate-600">Booster seats will be provided by The School Shuttle for children who are required by law to use one. We will strive to accommodate each child with the same type of seat they use in their parents’/guardians’ car. Parents/guardians are welcome to supply their booster seat if they choose to do so.</p>
              </div>
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-[11px] font-semibold leading-5 text-slate-700"><strong>PLEASE NOTE:</strong><br />• All children under 8 years old must be secured in a booster seat.<br />• Booster seats are not permitted in the front seat.</div>
            </div>
          </Box>

          <Box title="PARENT SPECIAL REQUEST INSTRUCTIONS FOR TRANSPORTATION" icon="✏️" className="mt-4">
            <p className="mb-2 text-xs font-semibold text-slate-600">Please share any special requests regarding transportation for your child:</p>
            <textarea className="min-h-20 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm outline-none" />
            <div className="mt-3 max-w-xs"><Field label="Parent/Guardian Initials" highlight /></div>
          </Box>
          <ThankYou />
        </ConsentPage>

        <ConsentPage page="2 of 4">
          <ConsentHeader />
          <p className="mx-auto mt-3 max-w-3xl text-center text-sm font-bold italic leading-6 text-slate-700">The School Shuttle will make every effort to accommodate any special requests, provided they are possible and safe for all passengers.</p>

          <Box title="TRANSPORTATION AUTHORIZATION" icon="📋" className="mt-5">
            <p className="text-sm font-black leading-6 text-slate-800">I, the undersigned, authorize The School Shuttle and its staff and/or volunteers to transport my minor child in a company vehicle driven by an authorized individual.</p>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-700">I understand that I am responsible for reading, understanding, and discussing transportation guidelines with my child.</p>
            <div className="mt-4 space-y-3">
              {authorizationStatements.map((statement) => <PolicyLine key={statement} text={statement} />)}
            </div>
            <div className="mt-5 max-w-xs"><Field label="Parent/Guardian Initials" highlight /></div>
          </Box>

          <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-start gap-3"><span className="text-3xl">⏰</span><div><p className="font-black text-[#102a56]">IMPORTANT REMINDER</p><p className="mt-1 text-sm font-semibold text-slate-700">Transportation schedule changes must be submitted by <strong>11:00 AM</strong> on the day transportation is needed.</p></div></div>
          </div>
          <ThankYou />
        </ConsentPage>

        <ConsentPage page="3 of 4">
          <ConsentHeader />
          <Box title="TRANSPORTATION POLICIES ACKNOWLEDGEMENT" icon="🛡️" className="mt-5">
            <p className="text-sm font-semibold leading-6 text-slate-700">Please read and initial each statement below to acknowledge that you understand and agree to our transportation policies.</p>
            <div className="mt-5 space-y-4">
              {policyStatements.map((statement) => (
                <div key={statement} className="grid grid-cols-[74px_1fr] items-start gap-3">
                  <input aria-label={`Initials for ${statement}`} className="h-11 rounded-lg border-2 border-amber-300 bg-white px-2 text-center text-sm font-black uppercase outline-none" maxLength={4} />
                  <p className="pt-1 text-sm font-semibold leading-6 text-slate-700">{statement}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 max-w-xs"><Field label="Parent/Guardian Initials" highlight /></div>
          </Box>
          <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4"><p className="font-black text-[#102a56]">📅 IMPORTANT REMINDER</p><p className="mt-1 text-sm font-semibold text-slate-700">Transportation schedule changes must be submitted by <strong>11:00 AM</strong> on the day transportation is needed.</p></div>
          <ThankYou />
        </ConsentPage>

        <ConsentPage page="4 of 4">
          <ConsentHeader />
          <Box title="LIABILITY WAIVER AND RELEASE" icon="🛡️" className="mt-5">
            <p className="text-sm font-black italic text-slate-700">Parent/Guardian Initials for Each Statement:</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-[100px_1fr]">
              <Field label="Initials" highlight />
              <p className="text-sm font-semibold leading-7 text-slate-700">As a condition for the transportation received, I, for myself, my child, my executors, and assigns, further agree to release and forever discharge The School Shuttle, Thomason Childcare Solutions, Moore Family Childcare, Cathers Family Childcare, Anthony Thomason, Jennifer Thomason, Danielle Moore, Jonathan Cathers, and their agents, officers, employees, and volunteers from any claim that I might or that I could bring on my child’s behalf concerning any damages, demands or actions whatsoever, including those based on negligence, in any manner arising out of this transportation.</p>
            </div>
            <p className="mt-5 text-sm font-semibold leading-7 text-slate-700">I have read this entire waiver and authorization form. I fully understand its terms and conditions, and I agree to be legally bound by its terms.</p>
          </Box>

          <div className="mt-6 space-y-4">
            <SignatureField label="PARENT/GUARDIAN NAME (PRINTED)" />
            <SignatureField label="DATE" type="date" />
            <SignatureField label="PARENT/GUARDIAN SIGNATURE" />
            <SignatureField label="RELATIONSHIP TO CHILD" />
          </div>

          <div className="mt-6 grid gap-4 rounded-2xl border border-blue-200 bg-blue-50 p-5 sm:grid-cols-2">
            <div><p className="font-black text-[#102a56]">REMINDER</p><p className="mt-2 text-sm font-semibold leading-7 text-slate-700">☑ Changes by <strong>11:00 AM</strong><br />☑ Fees due Fridays by <strong>6:00 PM</strong><br />☑ Safety Always</p></div>
            <div className="flex items-center justify-center text-center text-lg font-black italic text-[#102a56]">Your communication helps us provide safe, reliable transportation! 💛</div>
          </div>
          <ThankYou />
        </ConsentPage>
      </div>
    </div>
  );
}

const authorizationStatements = [
  "My child is expected to follow all applicable laws regarding transport in a motor vehicle.",
  "My child must adhere to directions given by the driver, staff, or volunteers.",
  "Participation in the identified events is not a requirement for participation in the transportation program.",
  "The driver will never leave my child unattended in any vehicle.",
  "Each child will board or exit from the curbside of the street. If the curbside is unavailable, the driver will safely walk the child across the street.",
  "Any vehicle used to transport my child will be insured, registered, and pass inspection. It will be driven by an individual who is at least 18 years old, live-scanned into our program, and holds a valid California driver’s license.",
  "I will be notified if the driver is running late due to uncontrollable circumstances, such as heavy traffic or road closures.",
  "My child will travel in a motor vehicle driven by a qualified adult, and my child is to wear a safety belt during travel.",
  "My child is expected to listen to supervising staff/drivers, and respect staff and other children, the vehicles they ride in, and the people they travel with during the trip.",
  "Riding in a motor vehicle may result in personal injuries or death from wrecks, collisions, or acts by riders, other drivers, or other objects.",
  "My child is to remain in their seat and not be disruptive to the driver of the vehicle.",
  "I understand that I may be called upon to pick my child up if they fail to comply with these requirements.",
];

const policyStatements = [
  "Transportation schedule changes must be submitted by 11:00 AM on the day transportation is needed.",
  "Transportation fees are due every Friday by 6:00 PM.",
  "Transportation fees are not covered by CCRC or other subsidy programs. Fees are the responsibility of the parent/guardian.",
  "Pick-up and drop-off availability depends on school dismissal times and route availability.",
  "Parents must notify us immediately if their child will not need transportation due to absence, change in schedule, minimum day, early dismissal, field trips, or other events.",
  "Children must be signed in to childcare before morning transportation.",
  "Children are expected to follow staff directions and remain properly seated at all times.",
  "Transportation may be suspended if fees become delinquent.",
  "The School Shuttle staff may refuse transportation if a child’s behavior creates an unsafe environment for others.",
];

function ConsentHeader() {
  return (
    <div className="border-b-4 border-amber-400 pb-4 text-center">
      <div className="flex items-center justify-center gap-3"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-400 text-[#102a56]"><Bus className="h-8 w-8" /></div><div className="text-left"><p className="text-sm font-black italic text-[#102a56]">The School Shuttle</p><p className="text-[10px] font-black uppercase tracking-[.16em] text-slate-500">Safe Rides. Bright Futures. Every Day!</p></div></div>
      <h1 className="mt-3 text-3xl font-black tracking-tight text-[#102a56] sm:text-4xl">SCHOOL TRANSPORTATION CONSENT</h1>
      <div className="mx-auto mt-2 inline-flex rounded-full bg-amber-400 px-5 py-1.5 text-sm font-black text-[#102a56]">SCHOOL YEAR 2026-2027</div>
    </div>
  );
}

function ConsentPage({ children, page }: { children: React.ReactNode; page: string }) {
  return <section className="consent-page relative mb-6 min-h-[10in] rounded-2xl border border-slate-200 bg-white p-5 shadow-xl sm:p-8">{children}<p className="absolute bottom-3 right-5 text-[10px] font-bold text-slate-500">Page {page}</p></section>;
}

function Box({ title, icon, children, className = "" }: { title: string; icon: string; children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border-2 border-slate-200 p-4 ${className}`}><div className="mb-3 flex items-center gap-2"><span className="text-xl">{icon}</span><h2 className="text-sm font-black tracking-wide text-[#102a56]">{title}</h2></div>{children}</section>;
}

function Field({ label, highlight = false }: { label: string; highlight?: boolean }) {
  return <label className="block"><span className={`mb-1 block text-[10px] font-black uppercase tracking-wide ${highlight ? "text-[#102a56]" : "text-slate-600"}`}>{label}</span><input className={`h-9 w-full border-0 border-b-2 px-1 text-sm font-semibold outline-none ${highlight ? "border-amber-400 bg-amber-50" : "border-slate-300 bg-white"}`} /></label>;
}

function TimeField({ label }: { label: string }) {
  return <div className="grid grid-cols-[1fr_82px_82px] items-end gap-2"><Field label={label} /><Check label="AM" compact /><Check label="PM" compact /></div>;
}

function Check({ label, compact = false }: { label: string; compact?: boolean }) {
  return <label className={`flex items-start gap-2 ${compact ? "text-xs" : "text-sm"}`}><input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-400 accent-[#1769d2]" /><span className="font-semibold leading-5 text-slate-700">{label}</span></label>;
}

function PolicyLine({ text }: { text: string }) {
  return <div className="flex items-start gap-3"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#1769d2] text-[10px] font-black text-white">✓</span><p className="text-sm font-semibold leading-6 text-slate-700">{text}</p></div>;
}

function SignatureField({ label, type = "text" }: { label: string; type?: string }) {
  return <label className="grid gap-2 rounded-xl border-2 border-amber-200 bg-white p-3 sm:grid-cols-[230px_1fr] sm:items-center"><span className="flex items-center gap-2 text-xs font-black text-[#102a56]"><FileText className="h-4 w-4" /> {label}:</span><input type={type} className="h-9 border-0 border-b-2 border-slate-300 bg-white px-1 text-sm font-semibold outline-none" /></label>;
}

function ThankYou() {
  return <div className="mt-5 flex items-center justify-center gap-2 border-t border-dashed border-slate-300 pt-4 text-center text-sm font-black italic text-[#102a56]"><ShieldCheck className="h-4 w-4 text-amber-500" /> Thank you for trusting The School Shuttle with your child’s safety! 💛</div>;
}
