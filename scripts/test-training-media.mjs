import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const require = createRequire(import.meta.url);
function load(path, dependencies = {}, globals = {}) {
  const context = { exports: {}, Response, Request, Error, URL, File, setTimeout, clearTimeout, process, ...globals, require: name => {
    if (name.endsWith('.css') || name === 'server-only') return {};
    return dependencies[name] ?? require(name);
  } };
  vm.runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  return context.exports;
}
const files = load('src/lib/training-files.ts');
const access = load('src/lib/training-access.ts', {
  '@/lib/location-config': load('src/lib/location-config.ts'), '@/lib/team-access': load('src/lib/team-access.ts'),
});
const assetId = '00000000-0000-4000-8000-000000000011';
const certificateId = '00000000-0000-4000-8000-000000000012';
const training = { id: 'training-synthetic', title: 'Synthetic Welcome', active: true, allStaff: true, locations: [], roles: [], assignedEmails: [], includeLeadership: true, contentAssetId: assetId, certificateAssetId: certificateId, deliveryType: 'Uploaded Content', contentName: 'welcome.mp4', contentMimeType: 'video/mp4', dueDate: '', description: '', instructions: '', baseXp: 100, onTimeBonusXp: 0, lateXp: 0, verificationRequired: true, requiresProof: false };
const profile = { user_id: 'learner', full_name: 'Synthetic Learner', email: 'learner@example.test', role: 'Employee', is_active: true, organization_id: 'one', locations: ['Halcom'] };
const owner = { ...profile, user_id: 'admin', full_name: 'Synthetic Admin', role: 'Owner / Admin' };
function fixture({ manager = false, organization = 'one', status = 'ready', kind = 'content', completion = null, fileInfo, denied = 0, failQuery = false, assigned = training } = {}) {
  const p = { ...(manager ? owner : profile), organization_id: organization };
  const id = kind === 'content' ? assetId : certificateId;
  const tables = {
    training_assets: [{ id, organization_id: 'one', training_id: training.id, kind, filename: kind === 'content' ? 'welcome.mp4' : 'certificate.pdf', mime_type: kind === 'content' ? 'video/mp4' : 'application/pdf', size_bytes: 7340032, storage_path: `one/${training.id}/${id}`, status, uploaded_by: 'admin' }],
    hub_state: [{ organization_id: 'one', state_key: 'tcs-team-trainings-v1', state_value: [assigned] }, { organization_id: 'one', state_key: 'tcs-team-training-completions-v1', state_value: completion ? [{ trainingId: training.id, userId: 'learner', status: completion }] : [] }],
  };
  const signed = [], uploaded = [], mutations = [];
  const db = { from(table) {
    let filters = [], operation, values;
    const query = {
      select() { return query; }, eq(k,v) { filters.push(row => row[k] === v); return query; },
      in(k,v) { filters.push(row => v.includes(row[k])); return query; },
      insert(v) { operation = 'insert'; values = v; return query; }, update(v) { operation = 'update'; values = v; return query; }, delete() { operation = 'delete'; return query; },
      maybeSingle() { return query.then(r => ({ ...r, data: r.data?.[0] ?? null })); },
      then(resolve,reject) {
        let rows = (tables[table] ?? []).filter(row => filters.every(fn => fn(row)));
        if (operation) {
          mutations.push({ table, operation, values });
          if (operation === 'insert') { tables[table].push(values); rows = [values]; }
          if (operation === 'update') rows.forEach(row => Object.assign(row,values));
          if (operation === 'delete') tables[table] = tables[table].filter(row => !rows.includes(row));
        }
        return Promise.resolve({ data: rows, error: failQuery ? { message: 'Storage metadata unavailable' } : null }).then(resolve,reject);
      },
    }; return query;
  }, storage: { from(bucket) {
    assert.equal(bucket,'training-assets');
    return {
      createSignedUploadUrl: async path => { uploaded.push(path); return { data: { token: 'upload-capability' }, error: null }; },
      createSignedUrl: async (path,seconds,options) => { signed.push({ path,seconds,options }); return { data: { signedUrl: 'https://storage.example.test/signed-file' }, error: null }; },
      info: async () => fileInfo ?? { data: { size: 7340032, contentType: kind === 'content' ? 'video/mp4' : 'application/pdf' }, error: null },
    };
  } } };
  const auth = { admin: db, profile: p, user: { id: p.user_id }, isOwner: manager };
  const dependencies = {
    '@/lib/training-files': files, '@/lib/training-access': access,
    '@/lib/server/require-staff': { requireStaff: async () => { if (denied) throw new Response('Unauthorized',{ status: denied }); return auth; }, staffErrorResponse: e => e instanceof Response ? e : Response.json({ error: e.message },{ status: 500 }) },
  };
  dependencies['@/lib/server/training-assets'] = load('src/lib/server/training-assets.ts', dependencies);
  const start = load('src/app/api/training-assets/route.ts',dependencies);
  const finish = load('src/app/api/training-assets/[id]/complete/route.ts',dependencies);
  const download = load('src/app/api/training-assets/[id]/route.ts',dependencies);
  return { tables, signed, uploaded, mutations, start: input => start.POST(new Request('https://hub.test/api/training-assets',{ method: 'POST', body: JSON.stringify(input) })), finish: () => finish.POST(new Request('https://hub.test'),{ params: Promise.resolve({ id }) }), get: () => download.GET(new Request('https://hub.test'),{ params: Promise.resolve({ id }) }) };
}

test('training upload checks extension, content type, certificate type, size and path-safe filenames', () => {
  assert.equal(files.trainingFileDetails('content','Welcome.MP4',7340032,'video/mp4').mimeType,'video/mp4');
  assert.equal(files.trainingFileDetails('certificate','completion.pdf',100,'').mimeType,'application/pdf');
  for (const args of [['content','bad.html',100,'text/html'],['content','video.mp4',100,'text/html'],['content','video.mp4',52428801,'video/mp4'],['content','empty.mp4',0,'video/mp4'],['certificate','clip.mp4',100,'video/mp4'],['certificate','large.pdf',15728641,'application/pdf'],['content','../video.mp4',100,'video/mp4']]) assert.throws(() => files.trainingFileDetails(...args));
});
test('only active training admins can prepare private uploads; paths are scoped and generated on the server', async () => {
  const input = { trainingId: training.id, kind: 'content', filename: 'welcome.mp4', size: 7340032, mimeType: 'video/mp4', organization_id: 'forged', storage_path: 'forged' };
  for (const settings of [{}, { denied: 401 }]) { const f = fixture(settings); assert.ok([401,403].includes((await f.start(input)).status)); assert.equal(f.uploaded.length,0); }
  const f = fixture({manager:true}); const r = await f.start(input); assert.equal(r.status,200);
  const value = await r.json(); assert.match(value.path,/^one\/training-synthetic\/[0-9a-f-]+\.mp4$/); assert.equal(value.token,'upload-capability'); assert.equal(f.mutations[0].values.organization_id,'one');
  assert.equal((await f.start({...input,size:999999999})).status,400); assert.equal(f.uploaded.length,1);
  assert.equal((await f.start({...input,trainingId:'../another-training'})).status,400);
});
test('incomplete or mismatched files cannot become ready, and another organization cannot finalize them', async () => {
  for (const fileInfo of [{ data:null,error:{message:'not found'} }, { data:{size:50,contentType:'video/mp4'},error:null }, { data:{size:7340032,contentType:'text/html'},error:null }]) {
    const f=fixture({manager:true,status:'pending',fileInfo}); assert.ok([400,409].includes((await f.finish()).status)); assert.equal(f.tables.training_assets[0].status,'pending');
  }
  assert.equal((await fixture({manager:true,organization:'two'}).finish()).status,404);
  const f=fixture({manager:true,status:'pending'}); assert.equal((await f.finish()).status,200); assert.equal(f.tables.training_assets[0].status,'ready');
});
test('video access checks session, organization, assigned training and readiness before signing', async () => {
  const valid = fixture(); assert.equal((await valid.get()).status,200); assert.equal(valid.signed.length,1);
  assert.equal((await fixture({organization:'two'}).get()).status,404);
  assert.equal((await fixture({status:'pending'}).get()).status,409);
  assert.equal((await fixture({denied:401}).get()).status,401);
  for (const assigned of [{...training,active:false},{...training,contentAssetId:'other-id'},{...training,allStaff:false,locations:['Division']}]) {
    const f=fixture({assigned}); assert.equal((await f.get()).status,403); assert.equal(f.signed.length,0);
  }
  assert.equal((await fixture({failQuery:true}).get()).status,500);
});
test('provided certificates unlock only for the learner with a verified completion, with an admin preview', async () => {
  for (const completion of [null,'Submitted','Rejected']) {
    const f=fixture({kind:'certificate',completion}); assert.equal((await f.get()).status,403); assert.equal(f.signed.length,0);
  }
  const f=fixture({kind:'certificate',completion:'Verified'}); assert.equal((await f.get()).status,200); assert.equal(f.signed[0].options.download,'certificate.pdf');
  assert.equal((await fixture({kind:'certificate',manager:true}).get()).status,200);
  const other=fixture({kind:'certificate',completion:'Verified'}); other.tables.hub_state[1].state_value[0].userId='another-staff'; assert.equal((await other.get()).status,403);
});
test('Everyone includes current and future staff and leadership across locations, while selected assignments remain scoped', () => {
  for (const p of [profile,owner,{...profile,locations:['Division']},{...profile,locations:[],role:'Location Licensee'}]) assert.equal(access.isTrainingAssigned(training,p),true);
  assert.equal(access.isTrainingAssigned(training,{...profile,is_active:false}),false);
  assert.equal(access.isTrainingAssigned({...training,active:false},profile),false);
  assert.equal(access.isTrainingAssigned({...training,allStaff:false,locations:['Division']},profile),false);
  assert.equal(access.isTrainingAssigned({...training,allStaff:false,locations:['Halcom'],assignedEmails:['someone-else@example.test']},profile),false);
});
test('the client sends video bytes directly through signed resumable upload and finalizes only after success', async () => {
  let options; const calls=[], progress=[];
  const client=load('src/lib/training-upload.ts',{
    'tus-js-client':{Upload:class {constructor(file,opts){assert.equal(file.size,7340032);options=opts;}start(){options.onProgress(6000000,7340032);options.onSuccess();}}},
    '@/lib/training-files':files,
    '@/lib/hub-request':{hubRequest:async(path,token,init)=>{calls.push({path,token,init});return path==='/api/training-assets'?{assetId,path:'one/training-synthetic/video.mp4',token:'upload-capability',bucket:'training-assets',mimeType:'video/mp4'}:{assetId,name:'welcome.mp4'};}},
  },{process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://synthetic.supabase.co'}}});
  const r=await client.uploadTrainingAsset({name:'welcome.mp4',size:7340032,type:'video/mp4'},'content',training.id,'staff-session',n=>progress.push(n));
  assert.equal(r.assetId,assetId); assert.equal(options.endpoint,'https://synthetic.storage.supabase.co/storage/v1/upload/resumable'); assert.equal(options.chunkSize,6*1024*1024); assert.equal(options.headers['x-signature'],'upload-capability'); assert.equal(options.headers.Authorization,undefined);
  assert.equal(calls.length,2); assert.ok(calls[1].path.endsWith('/complete')); assert.equal(options.metadata.cacheControl,'0'); assert.ok(progress[0]>0);
});
test('new metadata and storage stay private even for signed-in staff', async () => {
  const db=new PGlite();
  try {
    await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create table public.organizations(id uuid primary key);create table auth.users(id uuid primary key);create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);");
    await db.exec(readFileSync('supabase/migrations/20261109000902_training_media_assets.sql','utf8'));
    const {rows}=await db.query("select relrowsecurity,has_table_privilege('anon','public.training_assets','SELECT') as anon_read,has_table_privilege('authenticated','public.training_assets','SELECT,INSERT,UPDATE,DELETE') as staff_access from pg_class where oid='public.training_assets'::regclass");
    assert.deepEqual(rows,[{relrowsecurity:true,anon_read:false,staff_access:false}]);
    const {rows:buckets}=await db.query("select public,file_size_limit,allowed_mime_types from storage.buckets where id='training-assets'");
    assert.equal(buckets[0].public,false);assert.equal(buckets[0].file_size_limit,52428800);assert.ok(buckets[0].allowed_mime_types.includes('video/mp4'));
  } finally {await db.close();}
});

function ui({manager=true,trainings=[],completions=[],failUpload=false}={}) {
  const state=[],saved={ 'tcs-team-trainings-v1':trainings,'tcs-team-training-completions-v1':completions,'tcs-team-xp-ledger-v1':[] }, uploads=[], downloads=[];
  let cursor=0;
  const react={useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],next=>{state[i]=typeof next==='function'?next(state[i]):next;}];},useMemo:fn=>fn()};
  const empty=()=>null, children=({children})=>children;
  const p=manager?owner:profile;
  const page=load('src/app/(portal)/training-center/page.tsx',{
    react,'next/link':{default:children},'lucide-react':new Proxy({},{get:()=>empty}),
    '@/components/layout/MainLayout':{default:children},'@/components/brand/TcsKidsScene':{TcsKidsScene:empty},
    '@/components/providers/AuthProvider':{useAuth:()=>({profile:p,user:{id:p.user_id},session:{access_token:'fixture'}}),canAccessRoute:()=>true},
    '@/components/providers/LocationProvider':{useHubLocation:()=>({location:'Halcom',setLocation(){},availableLocations:['All Locations','Halcom','Division']})},
    '@/hooks/usePersistentState':{usePersistentState:key=>[saved[key],next=>{saved[key]=typeof next==='function'?next(saved[key]):next;},true]},
    '@/lib/team-store':load('src/lib/team-store.ts'),'@/lib/training-access':access,'@/lib/training-files':files,
    '@/lib/training-upload':{uploadTrainingAsset:async(file,kind,id,token,onProgress)=>{uploads.push({file,kind,id,token});onProgress(50);if(failUpload)throw new Error('Synthetic upload failed');return{assetId:kind==='content'?assetId:certificateId,name:file.name,mimeType:file.type};}},
    '@/lib/hub-request':{hubRequest:async path=>{downloads.push(path);return{url:'https://storage.example.test/video',mimeType:'video/mp4'};}},
  },{window:{open(){},setTimeout(){}},document:{createElement:()=>({click(){}})},fetch:async()=>new Response('{}')}).default;
  function flatten(node){if(Array.isArray(node))return node.flatMap(flatten);if(!node||typeof node!=='object')return[];if(typeof node.type==='function')return flatten(node.type(node.props));return[node,...flatten(node.props?.children)];}
  function nodes(){cursor=0;return flatten(page());}
  function content(node){if(typeof node==='string')return node;if(Array.isArray(node))return node.map(content).join('');return content(node?.props?.children??'');}
  const button=text=>nodes().find(n=>n.type==='button'&&content(n).trim()===text);
  const field=label=>{const row=nodes().find(n=>n.type==='label'&&content(n).startsWith(label));return flatten(row).find(n=>['input','select','textarea'].includes(n.type));};
  return{nodes,button,field,saved,uploads,downloads,content};
}
test('the creation form saves MP4, certificate and Everyone together without asking staff to upload the supplied certificate', async () => {
  const f=ui();f.button('Upload Video / PDF / PowerPoint').props.onClick();
  assert.equal(f.field('Assign to').props.value,'everyone');
  f.field('Training title').props.onChange({target:{value:'Welcome'}});
  f.field('Training video or document').props.onChange({target:{files:[new File(['video'],'welcome.mp4',{type:'video/mp4'})]}});
  f.field('Completion certificate for staff').props.onChange({target:{files:[new File(['certificate'],'certificate.pdf',{type:'application/pdf'})]}});
  assert.equal(f.field('Staff must upload their own certificate/proof'),undefined);
  await f.button('Create & Assign Training').props.onClick();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.uploads.length,2);assert.equal(f.saved['tcs-team-trainings-v1'].length,1);
  const value=f.saved['tcs-team-trainings-v1'][0];assert.equal(value.allStaff,true);assert.equal(value.includeLeadership,true);assert.equal(value.contentAssetId,assetId);assert.equal(value.certificateAssetId,certificateId);assert.equal(value.requiresProof,false);assert.equal(value.locations.length,0);
});
test('a failed upload keeps the creation form open and never creates a broken assignment', async () => {
  const f=ui({failUpload:true});f.button('Upload Video / PDF / PowerPoint').props.onClick();f.field('Training title').props.onChange({target:{value:'Welcome'}});f.field('Training video or document').props.onChange({target:{files:[new File(['video'],'welcome.mp4',{type:'video/mp4'})]}});
  await f.button('Create & Assign Training').props.onClick();await new Promise(resolve=>setImmediate(resolve));assert.equal(f.saved['tcs-team-trainings-v1'].length,0);assert.ok(f.button('Create & Assign Training'));assert.ok(f.nodes().some(n=>n.props.role==='alert'&&f.content(n).includes('Synthetic upload failed')));
});
test('staff can play the MP4 inside the Hub and download the supplied certificate after verification', async () => {
  const f=ui({manager:false,trainings:[training]});await f.button('Start Training').props.onClick();await new Promise(resolve=>setImmediate(resolve));
  const video=f.nodes().find(n=>n.type==='video');assert.equal(video.props.controls,true);assert.equal(video.props.playsInline,true);assert.ok(video.props.src.startsWith('https://storage.'));
  assert.equal(f.button('Download Certificate'),undefined);
  f.saved['tcs-team-training-completions-v1']=[{id:'c',trainingId:training.id,userId:'learner',staffEmail:profile.email,completedAt:'2026-11-08T12:00:00Z',status:'Verified'}];
  assert.ok(f.button('Download Certificate'));assert.ok(f.button('Review Training'));
});
