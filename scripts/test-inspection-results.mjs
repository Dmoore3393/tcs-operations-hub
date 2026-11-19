import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
const url=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64');
const m=await import(url(await readFile('src/lib/inspection-results.ts','utf8')));
const inspection=await import(url(await readFile('src/lib/pop-up-inspections.ts','utf8')));
test('released reports exclude leadership notes; unknown location labels cannot match each other',()=>{
 const doc={...inspection.newInspectionDocument(),notes:'Private observation',followUp:'Confidential follow-up'};
 const released=m.releasedInspectionDocument(doc);assert.equal(released.notes,'');assert.equal(released.followUp,'');assert.equal(doc.notes,'Private observation');assert.deepEqual(released.items,doc.items);
 const normalize=s=>s.includes('33rd')?'33rd Street':s.includes('Halcom')?'Halcom':'All Locations';
 assert.equal(m.sameInspectionLocation(['Halcom'],'33rd Street',normalize),false);
 assert.equal(m.sameInspectionLocation(['33rd Street'],'33rd / Cornejo',normalize),true);
 assert.equal(m.sameInspectionLocation(['Unknown one'],'Unknown two',normalize),false);
});
test('release is atomic and idempotent; submissions need leadership verification; private source stays unchanged',async()=>{
 const db=new PGlite();const org='00000000-0000-4000-8000-000000000001',site='00000000-0000-4000-8000-000000000002',id='00000000-0000-4000-8000-000000000003',leader='3b54f183-564a-40fa-87f2-3c515d526623',licensee='00000000-0000-4000-8000-000000000004',other='00000000-0000-4000-8000-000000000005';
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create table organizations(id uuid primary key);create table locations(id uuid primary key,organization_id uuid,name text);create table staff_access(user_id uuid,organization_id uuid,is_active boolean,role text,full_name text);`);
 await db.query('insert into organizations values($1)',[org]);await db.query('insert into locations values($1,$2,$3)',[site,org,'Test location']);
 for(const [user,role] of [[leader,'Owner'],[licensee,'Location Licensee'],[other,'Location Licensee']])await db.query('insert into staff_access values($1,$2,true,$3,$4)',[user,org,role,'Test Person']);
 await db.exec(await readFile('supabase/migrations/202611190001_private_popup_inspections.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20261119190000_inspection_results.sql','utf8'));
 const doc={...inspection.newInspectionDocument(),notes:'PRIVATE',followUp:'SECRET'};doc.items=doc.items.slice(0,3).map((i,n)=>({...i,rating:n===0?'meets':n===1?'partial':'needs_attention',urgent:n===2}));
 await db.query('select save_pop_up_inspection($1,$2,$3,0,$4,$5,$6,$7)',[org,leader,id,site,'2026-11-19','draft',JSON.stringify(doc)]);
 const release=actor=>db.query('select release_inspection($1,$2,$3,$4,$5)',[org,actor,id,licensee,'2026-11-23']);
 await assert.rejects(release(leader),/Complete/);await db.query("update pop_up_inspections set status='completed' where id=$1",[id]);
 await assert.rejects(release(other),/Private/);await release(leader);await release(leader);
 const report=(await db.query('select * from inspection_releases')).rows[0];assert.equal(report.document.notes,'');assert.equal(report.document.followUp,'');
 const tasks=(await db.query('select * from inspection_corrections')).rows;assert.equal(tasks.length,2);assert.equal(tasks[0].status,'Open');
 assert.equal((await db.query('select document from pop_up_inspections')).rows[0].document.notes,'PRIVATE');
 const task=tasks[0];const change=(actor,version,action,note)=>db.query('select update_inspection_correction($1,$2,$3,$4,$5,$6)',[org,actor,task.id,version,action,note]);
 await assert.rejects(change(other,1,'submit','done'),/not available/);
 await change(licensee,1,'submit','Corrected and checked');await assert.rejects(change(licensee,2,'accept',''),/not available/);await assert.rejects(change(leader,1,'accept',''),/changed/);
 await assert.rejects(change(leader,2,'return',''),/not available/);await change(leader,2,'return','Please complete the remaining correction');await change(licensee,3,'submit','Remaining correction completed');await change(leader,4,'accept','Physically verified');
 assert.equal((await db.query('select status from inspection_corrections where id=$1',[task.id])).rows[0].status,'Resolved');
 assert.equal((await db.query('select count(*)::int n from inspection_result_history')).rows[0].n,5);
 await db.exec('set role authenticated');for(const table of ['inspection_releases','inspection_corrections','inspection_result_history'])await assert.rejects(db.query('select * from '+table),/permission denied/);
 }finally{await db.close();}
});
test('opening an existing file and a creation race both return the saved checklist intact',async()=>{
 const source=await readFile('src/app/api/location-files/route.ts','utf8');
 const file={id:'existing-file',items:[{id:'signed-form',status:'Complete'}],archived:false};
 for(const race of [false,true]){
  let checks=0,inserts=0;
  const db={from(table){const q={select(){return q;},eq(){return q;},insert(){inserts++;return q;},async single(){return {data:null,error:{code:'23505'}};},async maybeSingle(){if(table==='locations')return {data:{id:'00000000-0000-4000-8000-000000000002',is_active:true,name:'33rd Street'},error:null};if(table==='children')return {data:{first_name:'Test',last_name:'Child'},error:null};if(table==='location_person_files'){checks++;return {data:race&&checks===1?null:file,error:null};}throw Error(table);}};return q;},async rpc(){return {data:true,error:null};}};
  globalThis.__fileAuditContext={isOwner:true,isLicensee:false,userClient:db,profile:{organization_id:'org'}};
  const replacements={
   '@/lib/location-file-child-links':url('export const childScreenLinkId=()=>"";'),
   '@/lib/server/require-staff':url('export const requireStaff=async()=>globalThis.__fileAuditContext;export const staffErrorResponse=e=>e instanceof Response?e:Response.json({error:String(e)},{status:500});'),
   '@/lib/location-person-files':url('export const initialLocationItems=()=>[];export const validFileDate=()=>true;export const validateLocationFileEdit=()=>({});'),
   '@/lib/child-file-audits':url('export const templateForChildLocation=()=>"In-Home";')
  };
  let code=source;for(const [from,to] of Object.entries(replacements))code=code.replace(from,to);
  const api=await import(url(code+'\n// '+race));
  const response=await api.POST(new Request('https://hub.test/api/location-files',{method:'POST',body:JSON.stringify({locationId:'00000000-0000-4000-8000-000000000002',personId:'00000000-0000-4000-8000-000000000003',type:'Child',confirmLocation:true})}));
  assert.equal(response.status,200);assert.deepEqual((await response.json()).file,file);assert.equal(inserts,race?1:0);
 }
 delete globalThis.__fileAuditContext;
});
