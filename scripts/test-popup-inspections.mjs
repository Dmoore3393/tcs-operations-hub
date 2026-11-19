import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
const url=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64');
const m=await import(url(await readFile('src/lib/pop-up-inspections.ts','utf8')));
const policy=await import(url(await readFile('src/lib/team-access.ts','utf8')));
test('only the three active pilot identities have private inspection access',()=>{
 for(const user_id of ['3b54f183-564a-40fa-87f2-3c515d526623','50abd10b-2b24-47d4-ade2-8b0031530aac','71b134f9-cb66-43ed-8c45-f71d85de21df']){
  assert.equal(policy.canUsePopUpInspections({user_id,is_active:true}),true);
  assert.equal(policy.canUsePopUpInspections({user_id,is_active:false}),false);
 }
 assert.equal(policy.canUsePopUpInspections({user_id:'other-owner',is_active:true,role:'Owner'}),false);
 assert.equal(policy.canUsePopUpInspections(null),false);
});
test('draft score excludes unreviewed and N/A, counts partial credit and keeps urgent concerns',()=>{
 const d=m.newInspectionDocument();assert.equal(m.validInspectionDocument(d),true);
 const items=d.items.slice(0,5).map((i,n)=>({...i,rating:['meets','partial','needs_attention','na',''][n],urgent:n===3}));
 const s=m.inspectionScore(items);assert.equal(s.percent,50);assert.equal(s.remaining,1);assert.equal(s.corrections.length,2);assert.equal(s.urgent.length,1);
 assert.equal(m.inspectionScore(items.map(i=>({...i,rating:'na'}))).percent,null);
 assert.equal(m.validInspectionDocument({...d,items:[d.items[0],d.items[0]]}),false);
 assert.equal(m.validInspectionDocument({...d,items:[{...d.items[0],rating:'complete'}]}),false);
});
test('private storage denies direct clients; saves are versioned, audited, immutable when complete',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table organizations(id uuid primary key);create table locations(id uuid primary key,organization_id uuid);create table staff_access(user_id uuid,organization_id uuid,is_active boolean);
 insert into organizations values('00000000-0000-4000-8000-000000000001');
 insert into locations values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001');
 insert into staff_access values('3b54f183-564a-40fa-87f2-3c515d526623','00000000-0000-4000-8000-000000000001',true);`);
 await db.exec(await readFile('supabase/migrations/202611190001_private_popup_inspections.sql','utf8'));
 const args=['00000000-0000-4000-8000-000000000001','3b54f183-564a-40fa-87f2-3c515d526623','00000000-0000-4000-8000-000000000003',0,'00000000-0000-4000-8000-000000000002','2026-11-19','draft',JSON.stringify(m.newInspectionDocument())];
 const save=a=>db.query('select * from save_pop_up_inspection($1,$2,$3,$4,$5,$6,$7,$8)',a);
 const one=await save(args);assert.equal(one.rows[0].version,1);
 await assert.rejects(save(args),/changed/);
 await assert.rejects(save([...args.slice(0,1),'00000000-0000-4000-8000-000000000004',...args.slice(2)]),/Private/);
 await save(args.map((v,n)=>n===3?1:n===6?'completed':v));
 await assert.rejects(save(args.map((v,n)=>n===3?2:v)),/Completed/);
 assert.equal((await db.query('select count(*)::int as n from pop_up_inspection_history')).rows[0].n,2);
 await db.exec('set role authenticated');
 await assert.rejects(db.query('select * from pop_up_inspections'),/permission denied/);
 await assert.rejects(db.query('select * from pop_up_inspection_history'),/permission denied/);
 }finally{await db.close();}
});

test('home and school-age templates retain their distinct CDSS sources and scope',()=>{
 const home=m.newInspectionDocument('home'),center=m.newInspectionDocument('school_age');
 assert.ok(home.items.some(i=>i.category.includes('Infant safe sleep')));
 assert.ok(!center.items.some(i=>i.category.includes('Infant safe sleep')));
 assert.ok(home.items.some(i=>i.reference.includes('102416.5')));
 assert.ok(center.items.some(i=>i.reference.includes('101516.5')));
 for(const doc of [home,center]){
  assert.ok(doc.items.every(i=>i.reference&&Object.values(m.inspectionSources).includes(i.sourceUrl)));
  assert.equal(m.validInspectionDocument(doc),true);
 }
 assert.equal(m.validInspectionDocument({...home,items:[{...home.items[0],sourceUrl:'javascript:alert(1)'}]}),false);
});

test('new observation checklists do not duplicate individual child or employee file audits',()=>{
 for(const program of ['home','school_age']){
  const d=m.newInspectionDocument(program);
  assert.ok(d.templateVersion.includes('OBSERVATION'));
  assert.ok(d.items.some(i=>i.label.includes('physically present')));
  assert.ok(d.items.some(i=>i.category==='Personal rights & care'));
  assert.ok(!d.items.some(i=>/records|files/i.test(i.category)));
  assert.ok(!d.items.some(i=>/immunization|transcripts|admission agreements|acknowledgment|parent acknowledg|LIC 700|LIC 627|LIC 995A/.test(i.label)));
 }
});
