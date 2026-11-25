'use client';
import {useEffect,useState} from 'react';
import {hubRequest} from '@/lib/hub-request';
import {pacificWorkedTime} from '@/lib/manual-worked-hours';
type Options={staff:Array<{user_id:string;full_name:string}>;locations:Array<{id:string;name:string}>};
const input='mt-1 block min-h-12 w-full rounded-xl border border-slate-300 bg-white p-3 text-base';
export default function ManualWorkedHoursPanel({token,onSaved}:{token:string;onSaved:()=>Promise<void>}) {
 const [options,setOptions]=useState<Options|null>(null),[loadError,setLoadError]=useState(''),[retry,setRetry]=useState(0);
 const [staffId,setStaffId]=useState(''),[locationId,setLocationId]=useState(''),[start,setStart]=useState(''),[end,setEnd]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 useEffect(()=>{let current=true;hubRequest<Options>('/api/time-clock/manual',token).then(data=>{if(current){setOptions(data);setLoadError('');}}).catch(err=>{if(current)setLoadError(err instanceof Error?err.message:'Could not load employees.');});return()=>{current=false;};},[token,retry]);
 let minutes=0;
 try{minutes=(Date.parse(pacificWorkedTime(end))-Date.parse(pacificWorkedTime(start)))/60000;}catch{/* Incomplete inputs are validated on submit. */}
 async function save(event:React.FormEvent){event.preventDefault();if(busy)return;setBusy(true);setError('');setMessage('');try{
  await hubRequest('/api/time-clock/manual',token,{method:'POST',body:JSON.stringify({staffId,locationId,start,end,reason})});
  const name=options?.staff.find(row=>row.user_id===staffId)?.full_name||'Employee';
  setStart('');setEnd('');setReason('');setMessage(`Worked hours saved for ${name}. The entry is included in clock history and payroll hours.`);
  await onSaved();
 }catch(err){setError(err instanceof Error?err.message:'Could not save worked hours.');}finally{setBusy(false);}}
 return <section id="add-worked-hours" className="rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm">
  <h2 className="text-xl font-black text-slate-950">Add worked hours</h2>
  <p className="mt-2 text-base text-slate-600">Manually enter a completed shift when the employee did not clock in through the Hub. All times are Pacific. Your name, entry date and reason are saved with the hours.</p>
  <p className="mt-2 text-sm text-slate-600">For an unpaid break, enter the worked portions as separate entries. To change an existing punch, use the correction section below.</p>
  {loadError?<div role="alert" className="mt-4 text-red-800">{loadError}<button type="button" onClick={()=>setRetry(value=>value+1)} className="ml-3 min-h-11 rounded-xl border px-4 font-bold">Try again</button></div>:!options?<p role="status" className="mt-4">Loading employees and locations…</p>:<form onSubmit={save} className="mt-4 grid gap-4 sm:grid-cols-2">
   <fieldset disabled={busy} className="contents">
    <label className="font-bold">Employee<select required value={staffId} onChange={e=>setStaffId(e.target.value)} className={input}><option value="">Choose an employee</option>{options.staff.map(row=><option key={row.user_id} value={row.user_id}>{row.full_name}</option>)}</select></label>
    <label className="font-bold">Work location<select required value={locationId} onChange={e=>setLocationId(e.target.value)} className={input}><option value="">Choose a location</option>{options.locations.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
    <label className="min-w-0 font-bold">Clock-in date and time (Pacific)<input type="datetime-local" required value={start} onChange={e=>setStart(e.target.value)} className={input}/></label>
    <label className="min-w-0 font-bold">Clock-out date and time (Pacific)<input type="datetime-local" required value={end} onChange={e=>setEnd(e.target.value)} className={input}/></label>
    <label className="font-bold sm:col-span-2">Reason for manual entry<textarea required minLength={3} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} placeholder="For example: Missed Hub clock-in; actual times confirmed with employee." className={input}/></label>
    {minutes>0&&minutes<=1440&&<p className="font-bold text-emerald-900 sm:col-span-2">Hours to add: {Math.floor(minutes/60)}h {minutes%60}m</p>}
    <button disabled={busy} className="min-h-12 rounded-xl bg-emerald-800 px-5 py-3 text-base font-bold text-white disabled:opacity-50 sm:col-span-2">{busy?'Saving…':'Save worked hours'}</button>
   </fieldset>
  </form>}
  {error&&<p role="alert" className="mt-4 text-base font-bold text-red-800">{error}</p>}{message&&<p role="status" className="mt-4 text-base font-bold text-emerald-900">{message}</p>}
 </section>;
}
