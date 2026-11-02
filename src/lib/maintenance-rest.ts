type RestRow={id?:string;child_id?:string|null;location_id:string;entry_date:string;entry_time:string;result?:string|null};
export function maintenanceRestSummary(rows:RestRow[],locationId:string,day:string,clock:string){
 const nowMinutes=Number(clock.slice(0,2))*60+Number(clock.slice(3,5));
 const latest=new Map<string,RestRow>();
 for(const row of rows){if(row.location_id!==locationId||row.entry_date!==day||!/^\d{2}:\d{2}$/.test(row.entry_time.slice(0,5)))continue;const time=row.entry_time.slice(0,5);if(time>clock)continue;const key=row.child_id||`unlinked:${row.id}`;const prior=latest.get(key);if(!prior||prior.entry_time<row.entry_time)latest.set(key,row);}
 let resting=false,uncertain=false;let lastEntryTime='';
 for(const row of latest.values()){lastEntryTime=lastEntryTime>row.entry_time?lastEntryTime:row.entry_time;const result=(row.result||'').toLowerCase();const asleep=result==='fell asleep'||result.startsWith('15-minute sleep check');if(asleep){const age=nowMinutes-(Number(row.entry_time.slice(0,2))*60+Number(row.entry_time.slice(3,5)));if(age>=0&&age<=45)resting=true;else uncertain=true;}else if(!['woke up','woke early','rest ended','did not sleep'].includes(result))uncertain=true;}
 return {status:resting?'resting':uncertain||!latest.size?'check_with_staff':'rest_ended',label:resting?'Rest recently recorded — avoid noisy work':uncertain||!latest.size?'Rest status needs staff confirmation':'Latest rest entries ended — confirm with staff',lastEntryTime:lastEntryTime.slice(0,5)};
}
