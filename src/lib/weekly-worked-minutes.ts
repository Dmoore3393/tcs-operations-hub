import {pacificWorkedTime} from './manual-worked-hours';
/** Clip completed paid intervals to Pacific payroll weeks, including overnight shifts. */
export function weeklyWorkedMinutes(events:Array<{event:string;occurredAt:string}>,week:string) {
 const next=new Date(`${week}T12:00:00Z`);next.setUTCDate(next.getUTCDate()+7);
 const min=Date.parse(pacificWorkedTime(`${week}T00:00`)),max=Date.parse(pacificWorkedTime(`${next.toISOString().slice(0,10)}T00:00`));
 let opened:number|null=null,paidFrom:number|null=null,pending=0,total=0;
 const clipped=(start:number,end:number)=>Math.max(0,Math.min(end,max)-Math.max(start,min));
 for(const row of [...events].sort((a,b)=>Date.parse(a.occurredAt)-Date.parse(b.occurredAt) || (Number(a.event==='clock_in')-Number(b.event==='clock_in')))){
  const stamp=Date.parse(row.occurredAt);if(!Number.isFinite(stamp))continue;
  if(row.event==='clock_in'){opened=stamp;paidFrom=stamp;pending=0;}
  else if(row.event==='break_start'&&opened!==null&&paidFrom!==null){pending+=clipped(paidFrom,stamp);paidFrom=null;}
  else if(row.event==='break_end'&&opened!==null&&paidFrom===null)paidFrom=stamp;
  else if(row.event==='clock_out'&&opened!==null){total+=pending+(paidFrom!==null?clipped(paidFrom,stamp):0);opened=null;paidFrom=null;pending=0;}
 }
 return Math.max(0,Math.round(total/60000));
}
