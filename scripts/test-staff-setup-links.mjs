import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const compile=(file,deps,extra={})=>{const ctx={exports:{},Response,URL,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://synthetic.invalid',NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic'}},Date,require:name=>name in deps?deps[name]:require(name),...extra};vm.runInNewContext(ts.transpileModule(file,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,ctx);return ctx.exports;};
const emailErrors=compile(await readFile('src/lib/auth-email-errors.ts','utf8'),{});
const source=await readFile('src/lib/server/staff-setup-links.ts','utf8');
const apiSource=await readFile('src/app/api/team-access/setup/route.ts','utf8');
const requestSource=await readFile('src/app/api/team-access/setup/request/route.ts','utf8');
function fixture(){
 let now=Date.parse('2026-11-03T12:00:00Z');
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 const account={user_id:'synthetic-user',organization_id:'synthetic-org',email:'synthetic@example.invalid',full_name:'Synthetic Staff',role:'Employee',is_active:true,accepted_at:null,invited_at:null};
 const tables={staff_access:[account],staff_setup_links:[]};const events=[];let sendError=null,generateUser=account.user_id;
 const qFor=table=>{const filters=[];let action='select',patch,fields;
  const q={select(v){fields=v;return q},insert(v){action='insert';patch=v;return q},update(v){action='update';patch=v;return q},eq(k,v){filters.push(r=>r[k]===v);return q},is(k,v){filters.push(r=>(r[k]??null)===v);return q},gt(k,v){filters.push(r=>r[k]>v);return q},ilike(k,v){filters.push(r=>r[k].toLowerCase()===v.toLowerCase());return q},or(expr){const [nil,lt]=expr.split(',');const k=nil.split('.')[0],value=lt.slice((k+'.lt.').length);filters.push(r=>r[k]==null||r[k]<value);return q},maybeSingle(){return q.then(r=>({...r,data:r.data?.[0]??null}))},then(resolve,reject){
   let rows=tables[table].filter(r=>filters.every(f=>f(r)));
   if(action==='insert'){const r={created_at:new Clock().toISOString(),ready_at:null,revoked_at:null,auth_user_id:null,last_exchange_at:null,...patch};tables[table].push(r);rows=[r];}
   if(action==='update')rows.forEach(r=>Object.assign(r,patch));
   return Promise.resolve({error:null,data:rows.map(r=>fields?Object.fromEntries(fields.split(',').map(k=>[k,r[k]])):{...r})}).then(resolve,reject);
  }};return q;
 };
 const auth={getUserById:async id=>({error:null,data:{user:{id,email:account.email}}}),generateLink:async options=>{events.push(['generate',options]);return {error:null,data:{user:{id:generateUser},properties:{hashed_token:'synthetic-provider-hash',verification_type:'recovery'}}}},inviteUserByEmail:async(...args)=>{events.push(['send',...args]);return {error:sendError}}};
 const publicAuth={verifyOtp:async options=>{events.push(['verify',options]);return {error:null,data:{user:{id:account.user_id},session:{user:{id:account.user_id,email:account.email},access_token:'synthetic-access',refresh_token:'synthetic-refresh'}}}},resetPasswordForEmail:async(...args)=>{events.push(['recovery',...args]);return{error:null}}};
 const admin={from:qFor,auth:{admin:auth}};
 const lib=compile(source,{'server-only':{},'@/lib/auth-email-errors':emailErrors,'@/lib/team-access':{isSupportedAccessRole:role=>['Employee','Owner / Admin','Location Licensee'].includes(role)},'@supabase/supabase-js':{createClient:()=>({auth:publicAuth})}},{Date:Clock});
 const deps={'@/lib/supabase/admin':{createSupabaseAdminClient:()=>admin},'@/lib/server/staff-setup-links':lib};
 const api=compile(apiSource,deps),requests=compile(requestSource,deps);
 const post=(body,path='setup')=>(path==='setup'?api:requests).POST(new Request('https://hub.test/api/team-access/'+path,{method:'POST',body:JSON.stringify(body)}));
 return {lib,admin,account,tables,events,post,advance:ms=>now+=ms,setSendError:e=>sendError=e,setGenerateUser:id=>generateUser=id,async issue(){const link=await lib.issueStaffSetupLink(admin,account.organization_id,account.email,'https://hub.test','es');await lib.activateStaffSetupLink(admin,link.tokenHash,account.user_id);return {...link,token:new URL(link.redirectTo).searchParams.get('setup')};}};
}

test('new invitation proofs are random, digest-only, linked to the same employee, and valid for the full 48 hours',async()=>{
 const f=fixture(),link=await f.issue();assert.match(link.token,/^[a-f0-9]{64}$/);assert.notEqual(link.tokenHash,link.token);assert.ok(!JSON.stringify(f.tables).includes(link.token));assert.equal(new URL(link.redirectTo).pathname,'/staff-setup');assert.equal(new URL(link.redirectTo).searchParams.get('lang'),'es');
 f.advance(47*3600000+59*60000);assert.equal((await f.post({action:'inspect',token:link.token})).status,200);
 f.advance(60000);assert.equal((await f.post({action:'inspect',token:link.token})).status,410);assert.equal(f.events.length,0);
});
test('opening or reopening a link does not consume it, create sessions, or send emails',async()=>{
 const f=fixture(),link=await f.issue();for(let i=0;i<3;i++){const r=await f.post({action:'inspect',token:link.token});assert.equal(r.status,200);assert.match(r.headers.get('Cache-Control'),/no-store/);assert.equal((await r.json()).email,f.account.email);}
 assert.equal(f.events.length,0);assert.equal(f.tables.staff_setup_links[0].last_exchange_at,null);
});
test('a 47-hour-old proof exchanges into a fresh verified session, with a 30-second retry limit',async()=>{
 const f=fixture(),link=await f.issue();f.advance(47*3600000);const r=await f.post({action:'exchange',token:link.token});assert.equal(r.status,200);assert.equal((await r.json()).session.user.id,f.account.user_id);assert.deepEqual(f.events.map(e=>e[0]),['generate','verify']);assert.equal(f.events[0][1].type,'recovery');assert.equal((await f.post({action:'exchange',token:link.token})).status,429);
 f.advance(31000);assert.equal((await f.post({action:'exchange',token:link.token})).status,200);
});
test('tampered, expired, revoked, paused, completed, mismatched-email and cross-organization proofs cannot mint a session',async()=>{
 const mutations=[f=>f.account.accepted_at=new Date().toISOString(),f=>f.account.is_active=false,f=>f.account.email='other@example.invalid',f=>f.account.organization_id='another-org',f=>f.account.role='Parent',f=>f.tables.staff_setup_links[0].revoked_at=new Date().toISOString(),f=>f.advance(49*3600000)];
 for(const change of mutations){const f=fixture(),link=await f.issue();change(f);assert.equal((await f.post({action:'exchange',token:link.token})).status,410);assert.equal(f.events.length,0);}
 const f=fixture();await f.issue();assert.equal((await f.post({action:'exchange',token:'0'.repeat(64)})).status,410);assert.equal((await f.post({action:'exchange',token:'bad'})).status,410);assert.equal(f.events.length,0);
});
test('a generated link for a different auth identity never reaches verification',async()=>{
 const f=fixture(),link=await f.issue();f.setGenerateUser('different-user');assert.equal((await f.post({action:'exchange',token:link.token})).status,410);assert.deepEqual(f.events.map(e=>e[0]),['generate']);
});
test('resends give a new 48-hour proof and retain the previous valid invitation until activation',async()=>{
 const f=fixture(),old=await f.issue();f.advance(24*3600000);const result=await f.lib.sendPendingStaffSetup(f.admin,f.account,'https://hub.test');assert.equal(result.validForHours,48);assert.equal(f.events[0][0],'send');assert.equal(f.tables.staff_setup_links.length,2);assert.equal((await f.post({action:'inspect',token:old.token})).status,200);
 assert.match(f.events[0][2].redirectTo,/\/staff-setup\?setup=/);f.account.accepted_at=new Date().toISOString();assert.equal((await f.post({action:'inspect',token:old.token})).status,410);
});
test('delivery failures revoke only the unsent proof and restore the previous sent timestamp; quotas never send twice',async()=>{
 const f=fixture();f.setSendError({code:'over_email_send_rate_limit',status:429});await assert.rejects(f.lib.sendPendingStaffSetup(f.admin,{...f.account},'https://hub.test'));assert.equal(f.account.invited_at,null);assert.ok(f.tables.staff_setup_links[0].revoked_at);assert.deepEqual(f.events.map(e=>e[0]),['send']);
});
test('confirmed but unfinished accounts receive the same durable proof through the recovery email',async()=>{
 const f=fixture();f.setSendError({code:'email_exists'});const result=await f.lib.sendPendingStaffSetup(f.admin,{...f.account},'https://hub.test');assert.equal(result.sentAs,'password setup');assert.deepEqual(f.events.map(e=>e[0]),['send','recovery']);assert.equal(f.events[0][2].redirectTo,f.events[1][2].redirectTo);
});
test('recipient recovery sends only for pending active staff, hides existence and throttles repeated requests',async()=>{
 for(const change of [f=>f.account.is_active=false,f=>f.account.accepted_at='done',f=>f.account.email='other@example.invalid']){const f=fixture();change(f);const r=await f.post({email:'synthetic@example.invalid'},'setup/request');assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true});assert.equal(f.events.length,0);}
 const f=fixture();assert.equal((await f.post({email:f.account.email},'setup/request')).status,200);assert.equal((await f.post({email:f.account.email},'setup/request')).status,200);assert.equal(f.events.filter(e=>e[0]==='send').length,1);
});
test('invitation proofs are inaccessible to anonymous and signed-in browser database roles',async()=>{
 const db=new PGlite();try{await db.exec('create role anon; create role authenticated; create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table public.organizations(id uuid primary key);');const files=await readdir('supabase/migrations');const file=files.find(f=>f.endsWith('_staff_setup_links_48_hours.sql'));await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from staff_setup_links'),/permission denied/);await db.exec('reset role');}
 await db.exec('set role service_role');assert.equal((await db.query('select * from staff_setup_links')).rows.length,0);
 }finally{await db.close();}
});

async function setupPage({activationFailsOnce=false,storageFails=false}={}){
 const contactLib=compile(await readFile('src/lib/staff-contact.ts','utf8'),{});
 let cursor=0;const slots=[],effects=[],calls=[];
 const session={user:{id:'synthetic',email:'synthetic@example.invalid'},access_token:'synthetic-fresh-access',refresh_token:'synthetic-fresh-refresh'};
 const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>slots[i]=typeof value==='function'?value(slots[i]):value]},useRef(initial){return react.useState({current:initial})[0]},useEffect(effect,deps){const i=cursor++;if(!slots[i]||deps.some((v,j)=>v!==slots[i][j]))effects.push(effect);slots[i]=deps}};
 let attempts=0;
 const fakeFetch=async(url,init)=>{const body=JSON.parse(init.body);calls.push({url,body,headers:init.headers});if(url.endsWith('/accept')){if(activationFailsOnce&&attempts++===0)return Response.json({error:'Synthetic connection interrupted'},{status:503});return Response.json({ok:true});}return Response.json(body.action==='exchange'?{session}:{email:session.user.email,fullName:'Synthetic Staff',expiresAt:'2026-11-05T12:00:00Z'});};
 const isolated={auth:{setSession:async value=>{calls.push('isolated-session');assert.equal(value.access_token,session.access_token);return{error:null,data:{session}}},updateUser:async()=>{calls.push('password');return{error:null}},getSession:async()=>({data:{session},error:null})}};
 const window={location:{href:'https://hub.test/staff-setup?setup='+'a'.repeat(64)+'#error=access_denied&error_code=otp_expired',pathname:'/staff-setup'},history:{replaceState(_a,_b,url){calls.push('clean-url');window.location.href=String(url)}}};
 const deps={react,'next/link':{default:'a'},'@/components/StaffContactFields':{default:'StaffContactFields'},'@/lib/staff-contact':contactLib,'@/hooks/useEmailCooldown':{useEmailCooldown:()=>({remaining:0,start(){}})},'@supabase/supabase-js':{createClient:()=>isolated},'@/lib/supabase/client':{supabase:{auth:{setSession:async()=>{calls.push('persist');if(storageFails)throw Error('Synthetic storage failure');return{error:null}}}}}};
 const page=compile(await readFile('src/components/StaffSetup.tsx','utf8'),deps,{window,fetch:fakeFetch,AbortSignal});
 const flat=n=>Array.isArray(n)?n.flatMap(flat):n&&typeof n==='object'?[n,...flat(n.props?.children)]:[];
 const render=()=>{cursor=0;return flat(page.default());};render();for(const effect of effects.splice(0))effect();await new Promise(setImmediate);
 function fill(){let nodes=render();const contact=nodes.find(n=>n.type==='StaffContactFields');contact.props.onChange({...contact.props.value,phone:'6615550123'});for(const n of nodes.filter(n=>n.type==='input'&&n.props.type==='password'))n.props.onChange({target:{value:'synthetic-test-password'}});}
 async function submit(){await render().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});return render();}
 return {calls,window,render,fill,submit};
}
test('an expired provider link with a valid proof opens setup without a browser auth session',async()=>{
 const page=await setupPage();assert.ok(page.window.location.href.includes('#setup='));assert.ok(!page.window.location.href.includes('?setup='));assert.ok(!page.window.location.href.includes('otp_expired'));assert.ok(page.render().some(n=>n.type==='StaffContactFields'));assert.ok(!page.calls.some(c=>c==='password'||c==='isolated-session'));
 page.fill();const nodes=await page.submit();assert.ok(nodes.some(n=>n.type==='h1'&&n.props.children==='Account activated!'));assert.equal(page.calls.filter(c=>c==='password').length,1);const activated=page.calls.find(c=>c.url?.endsWith('/accept'));assert.equal(activated.headers.Authorization,'Bearer synthetic-fresh-access');assert.equal(page.window.location.href,'/staff-setup');
});
test('a partial setup retries activation without issuing another password or invitation; storage failure still shows success',async()=>{
 const page=await setupPage({activationFailsOnce:true,storageFails:true});page.fill();let nodes=await page.submit();assert.ok(nodes.some(n=>n.props?.role==='alert'));nodes=await page.submit();assert.equal(page.calls.filter(c=>c==='password').length,1);assert.equal(page.calls.filter(c=>c.body?.action==='exchange').length,1);assert.ok(nodes.some(n=>n.type==='h1'&&n.props.children==='Account activated!'));assert.ok(nodes.some(n=>n.props?.href==='/login'));
});
