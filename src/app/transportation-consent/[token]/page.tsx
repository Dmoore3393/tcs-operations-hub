"use client";

import { CheckCircle2, Eraser, LoaderCircle, ShieldCheck } from "lucide-react";
import { useParams } from "next/navigation";
import { FormEvent, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";

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

type Consent = {
  childDob: string; grade: string; teacher: string; schoolName: string; schoolAddress: string;
  centerName: string; facilityNumber: string; locationAddress: string; route: string;
  transportationNeeded: string[]; days: string[]; homeAddress: string;
  schoolStartTime: string; schoolStartPeriod: string; dismissalTime: string; dismissalPeriod: string;
  minimumDayTime: string; minimumDayPeriod: string; parentPhone: string; emergencyName: string; emergencyPhone: string;
  boosterSeat: boolean; fivePointHarness: boolean; frontSeatAuthorization: boolean; safetyInitials: string;
  specialInstructions: string; specialInitials: string; authorizationInitials: string;
  policyInitials: string[]; policySectionInitials: string; waiverInitials: string;
  parentName: string; signatureDataUrl: string; relationship: string;
};

const blank: Consent = {
  childDob: "", grade: "", teacher: "", schoolName: "", schoolAddress: "", centerName: "", facilityNumber: "", locationAddress: "", route: "",
  transportationNeeded: [], days: [], homeAddress: "", schoolStartTime: "", schoolStartPeriod: "AM", dismissalTime: "", dismissalPeriod: "PM", minimumDayTime: "", minimumDayPeriod: "PM", parentPhone: "", emergencyName: "", emergencyPhone: "",
  boosterSeat: false, fivePointHarness: false, frontSeatAuthorization: false, safetyInitials: "", specialInstructions: "", specialInitials: "", authorizationInitials: "",
  policyInitials: Array(policyStatements.length).fill(""), policySectionInitials: "", waiverInitials: "", parentName: "", signatureDataUrl: "", relationship: "",
};

const input = "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#1769d2] focus:ring-4 focus:ring-blue-100";

export default function TransportationConsentPage() {
  const params = useParams<{ token: string }>();
  const token = String(params.token ?? "");
  const [meta, setMeta] = useState<{ childName: string; locationName: string } | null>(null);
  const [form, setForm] = useState<Consent>(blank);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch(`/api/transportation-consents/public?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        const payload = await response.json() as { childName?: string; locationName?: string; error?: string };
        if (!response.ok || !payload.childName || !payload.locationName) throw new Error(payload.error || "This transportation consent link is invalid.");
        if (active) { setMeta({ childName: payload.childName, locationName: payload.locationName }); setForm((current) => ({ ...current, centerName: payload.locationName ?? "" })); }
      } catch (problem) {
        if (active) setError(problem instanceof Error ? problem.message : "This transportation consent link is invalid.");
      } finally {
        if (active) setLoading(false);
      }
    }
    if (token) void load(); else { setLoading(false); setError("This transportation consent link is invalid."); }
    return () => { active = false; };
  }, [token]);

  function toggleList(key: "transportationNeeded" | "days", value: string) {
    setForm((current) => ({ ...current, [key]: current[key].includes(value) ? current[key].filter((item) => item !== value) : [...current[key], value] }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!form.signatureDataUrl) { setError("Please draw the parent/guardian signature before submitting."); return; }
    setSubmitting(true);
    try {
      const response = await fetch("/api/transportation-consents/public", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, consent: form }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Your consent form could not be submitted.");
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Your consent form could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <Shell><div className="py-20 text-center"><LoaderCircle className="mx-auto h-8 w-8 animate-spin text-[#1769d2]" /><p className="mt-3 font-bold text-slate-600">Opening secure consent form…</p></div></Shell>;
  if (error && !meta) return <Shell><div className="rounded-3xl border border-red-200 bg-red-50 p-7 text-center"><h1 className="text-2xl font-black text-red-950">Consent link unavailable</h1><p className="mt-3 font-semibold leading-6 text-red-800">{error}</p></div></Shell>;
  if (submitted) return <Shell><div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-8 text-center"><CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" /><h1 className="mt-4 text-3xl font-black text-emerald-950">Transportation Consent Submitted</h1><p className="mx-auto mt-3 max-w-xl font-semibold leading-7 text-emerald-800">Thank you. The 2026–2027 transportation consent for <strong>{meta?.childName}</strong> has been securely submitted to The School Shuttle.</p></div></Shell>;

  return <Shell>
    <header className="overflow-hidden rounded-[2rem] border border-blue-100 bg-white shadow-xl"><div className="bg-[#102a56] px-5 py-3 text-center text-xs font-black uppercase tracking-[.2em] text-white">Safe Rides • Bright Futures • Every Day! 💛</div><div className="px-5 py-7 text-center sm:px-8"><div className="mx-auto mb-3 grid h-16 w-24 place-items-center rounded-2xl bg-[#ffc72c] text-4xl">🚌</div><p className="text-sm font-black uppercase tracking-[.2em] text-[#1769d2]">The School Shuttle</p><h1 className="mt-1 text-4xl font-black tracking-tight text-[#102a56] sm:text-5xl">School Transportation Consent</h1><div className="mx-auto mt-3 inline-flex rounded-full bg-[#ffc72c] px-5 py-2 text-sm font-black text-[#102a56]">School Year 2026–2027</div><p className="mt-4 font-bold text-slate-600">Child: <span className="text-slate-950">{meta?.childName}</span> • Location: <span className="text-slate-950">{meta?.locationName}</span></p></div></header>

    <form onSubmit={submit} className="mt-6 space-y-6">
      <Card number="1" title="Child, School & Location Information">
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Child’s Full Name"><div className={`${input} bg-slate-100 text-slate-700`}>{meta?.childName}</div></Field><Field label="DOB"><input required type="date" className={input} value={form.childDob} onChange={(e) => setForm({ ...form, childDob: e.target.value })} /></Field><Field label="Grade (2026–2027)"><input required className={input} value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} /></Field><Field label="Teacher (Optional)"><input className={input} value={form.teacher} onChange={(e) => setForm({ ...form, teacher: e.target.value })} /></Field><Field label="Name of School"><input required className={input} value={form.schoolName} onChange={(e) => setForm({ ...form, schoolName: e.target.value })} /></Field><Field label="Address of School"><input required className={input} value={form.schoolAddress} onChange={(e) => setForm({ ...form, schoolAddress: e.target.value })} /></Field><Field label="Child Care Location (Center Name)"><input required className={input} value={form.centerName} onChange={(e) => setForm({ ...form, centerName: e.target.value })} /></Field><Field label="Facility Number"><input className={input} value={form.facilityNumber} onChange={(e) => setForm({ ...form, facilityNumber: e.target.value })} /></Field><Field label="Location Address"><input className={input} value={form.locationAddress} onChange={(e) => setForm({ ...form, locationAddress: e.target.value })} /></Field><Field label="Transportation Route (If applicable)"><input className={input} value={form.route} onChange={(e) => setForm({ ...form, route: e.target.value })} /></Field></div>

        <Sub title="Transportation Needed"><CheckRow checked={form.transportationNeeded.includes("AM Drop-off To School")} onChange={() => toggleList("transportationNeeded", "AM Drop-off To School")} label="AM Drop-off To School" /><CheckRow checked={form.transportationNeeded.includes("PM Pick-up From School")} onChange={() => toggleList("transportationNeeded", "PM Pick-up From School")} label="PM Pick-up From School" /><CheckRow checked={form.transportationNeeded.includes("Both AM & PM")} onChange={() => toggleList("transportationNeeded", "Both AM & PM")} label="Both AM & PM" /></Sub>
        <Sub title="Authorized Pickup/Drop-off Days"><div className="flex flex-wrap gap-2">{["Mon","Tue","Wed","Thu","Fri"].map((day) => <button key={day} type="button" onClick={() => toggleList("days", day)} className={`rounded-xl border px-4 py-2 text-sm font-black ${form.days.includes(day) ? "border-[#1769d2] bg-blue-50 text-[#1769d2]" : "border-slate-200 bg-white text-slate-600"}`}>{day}</button>)}</div></Sub>

        <div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Child’s Home Address"><input required className={input} value={form.homeAddress} onChange={(e) => setForm({ ...form, homeAddress: e.target.value })} /></Field><Field label="Parent’s Preferred Contact #"><input required type="tel" className={input} value={form.parentPhone} onChange={(e) => setForm({ ...form, parentPhone: e.target.value })} /></Field><TimeField label="School Start Time" value={form.schoolStartTime} period={form.schoolStartPeriod} onValue={(value) => setForm({ ...form, schoolStartTime: value })} onPeriod={(period) => setForm({ ...form, schoolStartPeriod: period })} /><TimeField label="School Dismissal Time" value={form.dismissalTime} period={form.dismissalPeriod} onValue={(value) => setForm({ ...form, dismissalTime: value })} onPeriod={(period) => setForm({ ...form, dismissalPeriod: period })} /><TimeField label="Minimum Day Dismissal Time" value={form.minimumDayTime} period={form.minimumDayPeriod} onValue={(value) => setForm({ ...form, minimumDayTime: value })} onPeriod={(period) => setForm({ ...form, minimumDayPeriod: period })} /><div></div><Field label="Emergency Contact During Transportation — Name"><input required className={input} value={form.emergencyName} onChange={(e) => setForm({ ...form, emergencyName: e.target.value })} /></Field><Field label="Emergency Contact Phone"><input required type="tel" className={input} value={form.emergencyPhone} onChange={(e) => setForm({ ...form, emergencyPhone: e.target.value })} /></Field></div>

        <Sub title="Safety & Seating Options"><CheckRow checked={form.boosterSeat} onChange={() => setForm({ ...form, boosterSeat: !form.boosterSeat })} label="My child requires a booster seat." /><CheckRow checked={form.fivePointHarness} onChange={() => setForm({ ...form, fivePointHarness: !form.fivePointHarness })} label="My child requires a 5-point harness." /><CheckRow checked={form.frontSeatAuthorization} onChange={() => setForm({ ...form, frontSeatAuthorization: !form.frontSeatAuthorization })} label="I authorize my child to ride in the front passenger seat when permitted by California law and at the direction of The School Shuttle staff." /><Field label="Parent/Guardian Initials"><input required maxLength={6} className={input} value={form.safetyInitials} onChange={(e) => setForm({ ...form, safetyInitials: e.target.value })} /></Field><p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-900"><strong>Please note:</strong> All children under 8 years old must be secured in a booster seat. Booster seats are not permitted in the front seat.</p></Sub>
        <Sub title="Parent Special Request Instructions for Transportation"><textarea className={`${input} min-h-28`} value={form.specialInstructions} onChange={(e) => setForm({ ...form, specialInstructions: e.target.value })} placeholder="Please share any special requests regarding transportation for your child." /><div className="mt-3"><Field label="Parent/Guardian Initials"><input maxLength={6} className={input} value={form.specialInitials} onChange={(e) => setForm({ ...form, specialInitials: e.target.value })} /></Field></div></Sub>
      </Card>

      <Card number="2" title="Transportation Authorization">
        <p className="font-bold leading-7 text-slate-800">I authorize The School Shuttle and its staff and/or volunteers to transport my minor child in a company vehicle driven by an authorized individual. I understand that I am responsible for reading, understanding, and discussing transportation guidelines with my child.</p>
        <div className="mt-4 space-y-2">{authorizationStatements.map((statement) => <div key={statement} className="flex gap-3 rounded-xl bg-slate-50 p-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#1769d2]" /><p className="text-sm font-semibold leading-6 text-slate-700">{statement}</p></div>)}</div>
        <div className="mt-4"><Field label="Parent/Guardian Initials"><input required maxLength={6} className={input} value={form.authorizationInitials} onChange={(e) => setForm({ ...form, authorizationInitials: e.target.value })} /></Field></div>
        <p className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-black text-blue-950">⏰ Important Reminder: Transportation schedule changes must be submitted by 11:00 AM on the day transportation is needed.</p>
      </Card>

      <Card number="3" title="Transportation Policies Acknowledgement">
        <p className="mb-4 text-sm font-semibold leading-6 text-slate-600">Please read and initial each statement below to acknowledge that you understand and agree to our transportation policies.</p>
        <div className="space-y-3">{policyStatements.map((statement, index) => <div key={statement} className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[90px_1fr] sm:items-center"><input required aria-label={`Initial policy ${index + 1}`} maxLength={6} className={`${input} text-center uppercase`} value={form.policyInitials[index]} onChange={(e) => { const next = [...form.policyInitials]; next[index] = e.target.value; setForm({ ...form, policyInitials: next }); }} placeholder="Initials" /><p className="text-sm font-semibold leading-6 text-slate-700">{statement}</p></div>)}</div>
        <div className="mt-4"><Field label="Parent/Guardian Initials"><input required maxLength={6} className={input} value={form.policySectionInitials} onChange={(e) => setForm({ ...form, policySectionInitials: e.target.value })} /></Field></div>
      </Card>

      <Card number="4" title="Liability Waiver and Release">
        <div className="mb-4 max-w-xs"><Field label="Initials"><input required maxLength={6} className={input} value={form.waiverInitials} onChange={(e) => setForm({ ...form, waiverInitials: e.target.value })} /></Field></div>
        <div className="space-y-4 text-sm font-semibold leading-7 text-slate-700"><p>As a condition for the transportation received, I, for myself, my child, my executors, and assigns, further agree to release and forever discharge The School Shuttle, Thomason Childcare Solutions, Moore Family Childcare, Cathers Family Childcare, Anthony Thomason, Jennifer Thomason, Danielle Moore, Jonathan Cathers, and their agents, officers, employees, and volunteers from any claim that I might or that I could bring on my child’s behalf concerning any damages, demands or actions whatsoever, including those based on negligence, in any manner arising out of this transportation.</p><p>I have read this entire waiver and authorization form. I fully understand its terms and conditions, and I agree to be legally bound by its terms.</p></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Parent/Guardian Name (Printed)"><input required className={input} value={form.parentName} onChange={(e) => setForm({ ...form, parentName: e.target.value })} /></Field><Field label="Relationship to Child"><input required className={input} value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} /></Field></div>
        <div className="mt-5"><p className="mb-2 text-sm font-black text-slate-800">Parent/Guardian Signature</p><SignaturePad value={form.signatureDataUrl} onChange={(signatureDataUrl) => setForm({ ...form, signatureDataUrl })} /></div>
        <label className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><input required type="checkbox" className="mt-1 h-5 w-5 accent-emerald-600" /><span className="text-sm font-bold leading-6 text-emerald-950">I confirm that I am the parent/guardian named above, I intend this drawn signature to be my electronic signature, and the information I provided is accurate to the best of my knowledge.</span></label>
      </Card>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">{error}</div>}
      <button disabled={submitting} type="submit" className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#1769d2] px-5 py-4 text-base font-black text-white shadow-xl transition hover:bg-[#1257b0] disabled:cursor-not-allowed disabled:opacity-60">{submitting ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />} {submitting ? "Submitting Securely…" : "Submit Signed Transportation Consent"}</button>
      <p className="pb-8 text-center text-xs font-semibold leading-5 text-slate-500">Your completed consent is encrypted and stored in the child’s private TCS document record.</p>
    </form>
  </Shell>;
}

function Shell({ children }: { children: React.ReactNode }) { return <main className="min-h-screen bg-[#f4f8fc] px-3 py-5 sm:px-6 sm:py-8"><div className="mx-auto max-w-4xl">{children}</div></main>; }
function Card({ number, title, children }: { number: string; title: string; children: React.ReactNode }) { return <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><div className="mb-5 flex items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#ffc72c] text-sm font-black text-[#102a56]">{number}</span><h2 className="text-xl font-black text-[#102a56] sm:text-2xl">{title}</h2></div>{children}</section>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-sm font-bold text-slate-700">{label}</span>{children}</label>; }
function Sub({ title, children }: { title: string; children: React.ReactNode }) { return <div className="mt-5 rounded-2xl border border-slate-200 bg-[#fbfdff] p-4"><h3 className="mb-3 text-sm font-black uppercase tracking-[.12em] text-[#1769d2]">{title}</h3><div className="space-y-2">{children}</div></div>; }
function CheckRow({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) { return <label className="flex cursor-pointer items-start gap-3 rounded-xl p-2 hover:bg-white"><input type="checkbox" checked={checked} onChange={onChange} className="mt-0.5 h-5 w-5 accent-[#1769d2]" /><span className="text-sm font-semibold leading-6 text-slate-700">{label}</span></label>; }
function TimeField({ label, value, period, onValue, onPeriod }: { label: string; value: string; period: string; onValue: (value: string) => void; onPeriod: (value: string) => void }) { return <Field label={label}><div className="grid grid-cols-[1fr_92px] gap-2"><input className={input} value={value} onChange={(e) => onValue(e.target.value)} placeholder="2:33" /><select className={input} value={period} onChange={(e) => onPeriod(e.target.value)}><option>AM</option><option>PM</option></select></div></Field>; }

function SignaturePad({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.clientWidth || 700;
    const height = 180;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineWidth = 2.5;
    context.lineCap = "round";
    context.strokeStyle = "#102a56";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
  }, []);

  function point(event: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function start(event: ReactPointerEvent<HTMLCanvasElement>) { const context = event.currentTarget.getContext("2d"); if (!context) return; drawing.current = true; const p = point(event); context.beginPath(); context.moveTo(p.x, p.y); event.currentTarget.setPointerCapture(event.pointerId); }
  function move(event: ReactPointerEvent<HTMLCanvasElement>) { if (!drawing.current) return; const context = event.currentTarget.getContext("2d"); if (!context) return; const p = point(event); context.lineTo(p.x, p.y); context.stroke(); }
  function end(event: ReactPointerEvent<HTMLCanvasElement>) { if (!drawing.current) return; drawing.current = false; onChange(event.currentTarget.toDataURL("image/png")); }
  function clear() { const canvas = canvasRef.current; if (!canvas) return; const context = canvas.getContext("2d"); if (!context) return; const ratio = window.devicePixelRatio || 1; context.save(); context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, canvas.width, canvas.height); context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height); context.restore(); onChange(""); }

  return <div><canvas ref={canvasRef} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} className="h-[180px] w-full touch-none rounded-2xl border-2 border-dashed border-blue-300 bg-white" /><div className="mt-2 flex items-center justify-between gap-3"><p className="text-xs font-semibold text-slate-500">Use your finger or mouse to sign inside the box.</p><button type="button" onClick={clear} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-100"><Eraser className="h-3.5 w-3.5" /> Clear</button></div>{value && <p className="mt-1 text-xs font-black text-emerald-700">✓ Signature captured</p>}</div>;
}
