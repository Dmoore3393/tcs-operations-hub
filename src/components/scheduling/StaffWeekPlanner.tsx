"use client";
import type {StaffShiftRow, StaffingLocation} from "@/lib/staffing-command";

function clock(value:string){const [h,m]=value.slice(0,5).split(':');return `${Number(h)%12||12}:${m} ${Number(h)>=12?'PM':'AM'}`;}
export default function StaffWeekPlanner({dates,location,shifts,saving,onAdd,onEdit}:{dates:string[];location:StaffingLocation;shifts:StaffShiftRow[];saving:boolean;onAdd:(date:string)=>void;onEdit:(shift:StaffShiftRow)=>void}){
 return <section aria-label="Weekly staff shift planner" className="space-y-4 rounded-3xl border border-emerald-200 bg-white p-4 text-base shadow-sm sm:p-6">
  <div><h2 className="text-2xl font-black text-emerald-950">{location.name} · Weekly Staff Planner</h2><p className="mt-2 text-base text-slate-700">Add a shift on any day. Tap a shift to edit its time, assignment or status. Publish the week above when it is ready for staff.</p></div>
  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">{dates.map(date=>{
   const rows=shifts.filter(shift=>shift.location_id===location.id&&shift.shift_date===date&&shift.status!=="Cancelled");
   const label=new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric'}).format(new Date(`${date}T12:00:00`));
   return <article key={date} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-3"><h3 className="mb-3 text-lg font-black text-emerald-950">{label}</h3><div className="space-y-3">{rows.map(shift=><button key={shift.id} disabled={saving} aria-label={`Edit ${shift.staff_name}, ${label}, ${clock(shift.start_time)} to ${clock(shift.end_time)}`} onClick={()=>onEdit(shift)} className="min-h-11 w-full rounded-xl border border-emerald-200 bg-white p-3 text-left text-base shadow-sm disabled:opacity-50"><strong className="block break-words text-emerald-950">{shift.staff_name}</strong><span className="mt-1 block text-slate-800">{clock(shift.start_time)}–{clock(shift.end_time)}</span><span className="mt-1 block break-words text-slate-700">{shift.position_label || 'Staff'}</span><span className="mt-2 inline-block rounded-full bg-emerald-100 px-2 py-1 text-sm font-bold text-emerald-900">{shift.status}</span></button>)}{!rows.length&&<p className="py-3 text-slate-600">No shifts yet.</p>}<button disabled={saving} onClick={()=>onAdd(date)} aria-label={`Add staff shift for ${label}`} className="min-h-11 w-full rounded-xl bg-emerald-800 px-3 py-3 text-base font-bold text-white disabled:opacity-50">+ Add Shift</button></div></article>;
  })}</div>
 </section>;
}
