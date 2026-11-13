"use client";
import {useRef,useState} from 'react';
import {dropoffGroups,canSelectDropoff,dropoffGroup,type DropoffRoute} from '@/lib/transport-bulk-dropoff';
import {hubRequest} from '@/lib/hub-request';
import {transportDestination} from '@/lib/transport-trips';
export default function SelectedDropoffs({routes,date,token,enabled,onSaved}:{routes:DropoffRoute[];date:string;token?:string;enabled:boolean;onSaved:(routes:DropoffRoute[])=>void}){
 const groups=dropoffGroups(routes,date);
 const [selected,setSelected]=useState<{key:string;ids:string[]}>({key:'',ids:[]}),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const flight=useRef(false),group=groups.find(g=>g.key===selected.key);
 const chosen=group?.children.filter(r=>selected.ids.includes(String(r.id)))||[];
 const stale=chosen.length!==selected.ids.length;
 async function save(){if(flight.current||!token||!enabled||!group||!confirmed||!chosen.length||stale)return;
  if(chosen.some(r=>!canSelectDropoff(r,date)||JSON.stringify(dropoffGroup(r,date))!==selected.key))return;
  flight.current=true;setBusy(true);setMessage('');
  try{const result=await hubRequest<{saved:number}>('/api/transportation-dropoffs',token,{method:'POST',body:JSON.stringify({date,stops:chosen.map(r=>({id:String(r.id),arrivedAt:r.arrivedAt})),group:group.group,confirmed:true})});
   if(result.saved!==chosen.length)throw new Error('The full selection could not be confirmed. Refresh before trying again.');
   setSelected({key:'',ids:[]});setConfirmed(false);setMessage(`${result.saved} selected children handed off at ${transportDestination(chosen[0])}. Care attendance stays in Brightwheel.`);onSaved(chosen);
  }catch(e){setMessage(e instanceof Error?e.message:'Could not confirm selected drop-offs. Refresh and check their status before retrying.');}finally{flight.current=false;setBusy(false);}
 }
 return <section className="space-y-3 rounded-2xl border border-emerald-300 bg-white p-4" aria-label="Selected child drop-offs"><h2 className="text-xl font-black text-emerald-950">Drop off selected children together</h2><p className="text-base text-slate-700">Mark each child Arrived first. Choose only the children physically being handed off now. One confirmation records separate drop-offs with the same timestamp; no child is preselected.</p>
  {!enabled&&<p className="rounded-xl bg-amber-50 p-3 text-amber-950">Connect and finish syncing individual pickup/arrival changes before using group drop-off.</p>}
  {message&&<p role="status" className="rounded-xl bg-blue-50 p-3 font-bold text-blue-950">{message}</p>}
  {!groups.length?<p>No children in this view are awaiting handoff at a fully assigned driver/vehicle/destination.</p>:groups.map(g=><fieldset key={g.key} disabled={!enabled||busy} className="rounded-xl border border-slate-200 p-3"><legend className="px-1 font-bold">{transportDestination(g.children[0])} · {g.group[2]} · {g.group[3]} · {g.group[0]}</legend><div className="flex flex-wrap gap-3">{g.children.map(route=><label key={route.id} className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-300 p-3"><input type="checkbox" className="h-5 w-5" checked={selected.key===g.key&&selected.ids.includes(String(route.id))} onChange={e=>{setConfirmed(false);setMessage('');setSelected(current=>({key:g.key,ids:e.target.checked?[...(current.key===g.key?current.ids:[]),String(route.id)]:current.ids.filter(id=>id!==String(route.id))}));}}/><span translate="no">{route.child}</span></label>)}</div></fieldset>)}
  {selected.ids.length>0&&<div className="space-y-3 rounded-xl bg-amber-50 p-4"><p className="font-bold">Selected: {chosen.map(r=>r.child).join(', ')} · {chosen.length} child{chosen.length===1?'':'ren'}</p>{stale&&<p role="alert" className="text-red-900">A selected trip changed. Clear and review the selection before confirming.</p>}<label className="flex min-h-11 items-start gap-3"><input type="checkbox" className="mt-1 h-5 w-5" disabled={busy||!enabled||stale} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>I physically verified every selected child has exited the vehicle and been handed to the appropriate receiving adult at this destination.</span></label><div className="flex flex-wrap gap-3"><button type="button" disabled={busy||!enabled||!confirmed||stale||!chosen.length} className="min-h-12 rounded-xl bg-emerald-800 px-5 py-3 font-black text-white disabled:opacity-50" onClick={()=>void save()}>{busy?'Confirming…':`Confirm ${chosen.length} selected drop-offs`}</button><button type="button" disabled={busy} className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 font-bold" onClick={()=>{setSelected({key:'',ids:[]});setConfirmed(false);}}>Clear selection</button></div></div>}
 </section>;
}
