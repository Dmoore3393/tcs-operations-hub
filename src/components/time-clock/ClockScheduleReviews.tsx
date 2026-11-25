"use client";
import {useCallback,useEffect,useState} from "react";
import {withRequestTimeout} from "@/lib/request-timeout";
type Review={event_id:string|number;staff_name:string;location_name:string;event:string;occurred_at:string;reasons:string[];explanation:string|null;explained_by_name:string|null;explained_at:string|null};
const stamp=(value:string)=>new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(value));
export default function ClockScheduleReviews({token,refreshKey}:{token:string;refreshKey:string}){
 const [reviews,setReviews]=useState<Review[]>([]),[notes,setNotes]=useState<Record<string,string>>({}),[error,setError]=useState(""),[busy,setBusy]=useState<string|null>(null),[loading,setLoading]=useState(true),[showExplained,setShowExplained]=useState(false);
 const load=useCallback(async()=>{
  try{
   const response=await withRequestTimeout(signal=>fetch("/api/time-clock/reviews",{signal,cache:"no-store",headers:{Authorization:`Bearer ${token}`}}),20000);
   const data=await response.json();if(!response.ok)throw Error(data.error||"Could not load clock reviews.");
   setReviews(data.reviews);setError("");
  }catch(err){setError(err instanceof Error?err.message:"Could not load reviews.");}finally{setLoading(false);}
 },[token]);
 useEffect(()=>{void load();},[load,refreshKey]);
 async function save(id:string){
  if(busy)return;setBusy(id);setError("");
  try{
   const response=await withRequestTimeout(signal=>fetch("/api/time-clock/reviews",{method:"POST",signal,headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({eventId:id,note:notes[id]||""})}),20000);
   const data=await response.json();if(!response.ok)throw Error(data.error||"Could not save explanation.");
   setNotes(current=>({...current,[id]:""}));await load();
  }catch(err){setError(err instanceof Error?err.message:"Could not save explanation. Check the review before retrying.");}finally{setBusy(null);}
 }
 const pending=reviews.filter(row=>!row.explained_at);
 const shown=showExplained?reviews:pending;
 return <section id="schedule-reviews" className="scroll-mt-24 rounded-3xl border border-amber-200 bg-white p-5 shadow-sm">
  <h2 className="text-xl font-black text-slate-950">Clock schedule explanations</h2>
  <p className="mt-2 text-base text-slate-700">{pending.length} need an explanation. The location licensee must explain early clock-ins, late clock-outs, or missing shifts. Administration can also add the note. Actual clock times stay recorded.</p>
  <p className="mt-2 text-sm text-slate-600">Adding an explanation records what happened; it does not change the published schedule, approve extra hours, or change payroll time.</p>
  <label className="mt-4 flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={showExplained} onChange={event=>setShowExplained(event.target.checked)}/>Show explained flags from the last 30 days</label>
  {error&&<p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800">{error} <button type="button" className="underline" onClick={()=>void load()}>Refresh reviews</button></p>}
  {loading?<p role="status" className="mt-4">Loading reviews…</p>:!shown.length?<p className="mt-4 text-slate-600">No {showExplained?"saved flags":"flags awaiting explanation"}.</p>:<div className="mt-4 space-y-4">{shown.map(row=>{
   const id=String(row.event_id);return <article key={id} className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
    <h3 className="text-base font-black">{row.staff_name} · {row.event==="clock_in"?"Clock In":"Clock Out"}</h3>
    <p className="mt-1 text-sm text-slate-700">{row.location_name} · {stamp(row.occurred_at)} Pacific · Receipt #{id}</p>
    {row.reasons.map(reason=><p key={reason} className="mt-2 text-sm font-bold text-amber-900">{reason}</p>)}
    {row.explained_at?<div className="mt-3 rounded-xl bg-white p-3"><p className="whitespace-pre-wrap text-base">{row.explanation}</p><p className="mt-2 text-sm text-slate-600">Explained by {row.explained_by_name} · {stamp(row.explained_at)} Pacific</p></div>:<form className="mt-3" onSubmit={event=>{event.preventDefault();void save(id);}}>
     <label className="block text-sm font-bold" htmlFor={`explanation-${id}`}>Required location explanation</label>
     <textarea id={`explanation-${id}`} required maxLength={2000} value={notes[id]||""} onChange={event=>setNotes(current=>({...current,[id]:event.target.value}))} placeholder="Explain the schedule change or why the employee started early or finished late." className="mt-2 min-h-24 w-full rounded-xl border border-amber-300 bg-white p-3 text-base"/>
     <button disabled={Boolean(busy)||!notes[id]?.trim()} className="mt-2 min-h-12 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50">{busy===id?"Saving explanation…":"Save explanation"}</button>
    </form>}
   </article>;
  })}</div>}
 </section>;
}
