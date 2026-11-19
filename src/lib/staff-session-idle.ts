/** Device-local activity metadata only; never stores credentials or record contents. */
export const STAFF_IDLE_TIMEOUT_MS=2*24*60*60*1000;
const key=(userId:string)=>'tcs-staff-last-activity:'+userId;
type ReadStorage=Pick<Storage,'getItem'>;
type WriteStorage=Pick<Storage,'setItem'|'removeItem'>;
export function readStaffActivity(storage:ReadStorage,userId:string,now:number):number|null{
 try{const raw=storage.getItem(key(userId));if(!raw)return null;const at=Number(raw);return Number.isFinite(at)&&at>0&&at<=now?at:null;}catch{return null;}
}
export function writeStaffActivity(storage:WriteStorage,userId:string,now:number){try{storage.setItem(key(userId),String(now));}catch{/* In-memory activity still works when browser storage is unavailable. */}}
export function clearStaffActivity(storage:WriteStorage,userId:string){try{storage.removeItem(key(userId));}catch{/* Credential cleanup remains independent. */}}
export function staffIdleExpired(lastActivity:number,now:number){return now-lastActivity>=STAFF_IDLE_TIMEOUT_MS;}
