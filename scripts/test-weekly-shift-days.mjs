import {PGlite} from '@electric-sql/pglite';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const source=await fs.readFile('src/components/scheduling/StaffingWorkspace.tsx','utf8');
const save=source.slice(source.indexOf('  async function saveShift('),source.indexOf('  async function deleteShift('));
function fixture({days=['2026-11-23','2026-11-25','2026-11-27'],shifts=[],activities=[],id,offStaff=[],off=false}={}){
 const writes=[],errors=[],messages=[];let loaded=0;
 const draft={id,location_id:'home',user_id:'staff',staff_name:'Synthetic Staff',shift_date:'2026-11-23',start_time:'08:00',end_time:'17:00',status:'Draft',position_label:off?'Off':'Floor',notes:'Same hours'};
 const c={exports:{},offStaff,staff:[{user_id:'staff',full_name:'Synthetic Staff'},{user_id:'second',full_name:'Second Staff'}],unlinkedStaff:[],supabase:{from:table=>({insert:async rows=>{writes.push({table,rows});return{}},update:row=>({eq:async(key,value)=>{writes.push({table,row,key,value});return{}}})})},shiftDraft:draft,shiftDays:days,saving:false,dates:['2026-11-23','2026-11-24','2026-11-25','2026-11-26','2026-11-27','2026-11-28','2026-11-29'],shifts,activities,overlapsTime:(a,b,c,d)=>a<d&&c<b,setSaving:()=>{},setError:e=>errors.push(e),locations:[],sendHubNotificationEvent:()=>{},accessToken:'synthetic',setShiftDraft:()=>{},showMessage:m=>messages.push(m),shortDate:d=>d,load:async()=>{loaded++}};
 vm.runInNewContext(ts.transpileModule(save+'\nexports.saveShift=saveShift;',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,c);
 return {writes,errors,messages,run:()=>c.exports.saveShift({preventDefault(){}}),loaded:()=>loaded};
}
test('one insert creates only selected weekdays with the same staff and hours',async()=>{
 const f=fixture();await f.run();assert.equal(f.writes.length,1);const rows=f.writes[0].rows;
 assert.equal(JSON.stringify(rows.map(r=>r.shift_date)),JSON.stringify(['2026-11-23','2026-11-25','2026-11-27']));
 assert.ok(rows.every(r=>r.user_id==='staff'&&r.location_id==='home'&&r.start_time==='08:00'&&r.end_time==='17:00'));assert.equal(f.loaded(),1);
});
test('empty and out-of-week selections write nothing',async()=>{
 for(const days of [[],['2026-11-30']]){const f=fixture({days});await f.run();assert.equal(f.writes.length,0);assert.ok(f.errors.some(Boolean));}
});
test('a conflict on any selected day prevents the entire batch, including another location',async()=>{
 const row={user_id:'staff',staff_name:'Synthetic Staff',shift_date:'2026-11-25',location_id:'other-home',status:'Draft',start_time:'09:00',end_time:'10:00'};
 const f=fixture({shifts:[row]});await f.run();assert.equal(f.writes.length,0);assert.match(f.errors.at(-1),/2026-11-25/);
 const a=fixture({activities:[{...row,activity_date:row.shift_date}]});await a.run();assert.equal(a.writes.length,0);
});
test('editing an existing shift still updates only its row',async()=>{
 const f=fixture({id:'existing-shift'});await f.run();assert.equal(f.writes.length,1);assert.equal(f.writes[0].value,'existing-shift');assert.equal(f.writes[0].row.shift_date,'2026-11-23');
});

test('bulk Off creates zero-hour entries for every selected staff and day',async()=>{
 const f=fixture({off:true,offStaff:['staff','second']});await f.run();assert.equal(f.writes.length,1);const rows=f.writes[0].rows;assert.equal(rows.length,6);assert.ok(rows.every(row=>row.position_label==='Off'&&row.start_time==='00:00'&&row.end_time==='00:00'));assert.equal(new Set(rows.map(row=>row.user_id)).size,2);
});
test('Off refuses to overwrite an existing shift for any selected person',async()=>{
 const f=fixture({off:true,offStaff:['staff','second'],shifts:[{user_id:'second',staff_name:'Second Staff',shift_date:'2026-11-25',status:'Published',start_time:'18:00',end_time:'20:00'}]});await f.run();assert.equal(f.writes.length,0);assert.match(f.errors.at(-1),/already has/);
});

test('database accepts zero-hour Off entries and snapshots, but rejects invalid work shifts',async()=>{
 const db=new PGlite();try{
 for(const name of ['staff_shifts','staff_schedule_publication_shifts'])await db.exec(`create table ${name}(position_label text,start_time time not null,end_time time not null,constraint ${name}_check check(end_time>start_time))`);
 await db.exec(await fs.readFile('supabase/migrations/20261123015421_staff_off_days.sql','utf8'));
 for(const table of ['staff_shifts','staff_schedule_publication_shifts']){
 await db.exec(`insert into ${table} values('Off','00:00','00:00'),('Floor','08:00','17:00')`);
 await assert.rejects(db.exec(`insert into ${table} values('Floor','00:00','00:00')`));
 await assert.rejects(db.exec(`insert into ${table} values('Off','08:00','17:00')`));
 }
 }finally{await db.close();}
});
