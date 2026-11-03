import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const exportsOf=(source,deps={})=>{const c={exports:{},Response,Date,URL,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://synthetic.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic-public-key'}},require:name=>{if(name in deps)return deps[name];throw Error(name)}};vm.runInNewContext(compile(source),c);return c.exports;};
const helpers=exportsOf(await fs.readFile('src/lib/auth-email-errors.ts','utf8'));
const source=await fs.readFile('src/app/api/team-access/resend/route.ts','utf8');
function fixture(inviteError=null,recoveryError=null,patch={}){
 const sent=[],writes=[],account={user_id:'synthetic',email:'synthetic@example.com',full_name:'Synthetic Staff',is_active:true,accepted_at:"completed",invited_at:null,...patch};let authorized=true;
 const admin={auth:{admin:{inviteUserByEmail:async(...args)=>{sent.push(['invite',...args]);return{error:inviteError}}}},from(table){const q={select(){return q},eq(){return q},ilike(){return q},maybeSingle:async()=>({data:account,error:null}),update(value){writes.push({table,value});return q},then(resolve){return Promise.resolve({error:null}).then(resolve)}};return q}};
 const api=exportsOf(source,{'@/lib/server/staff-setup-links':{sendPendingStaffSetup:async()=>{sent.push(['durable']);return{sentAs:'invite',validForHours:48}}},'@/lib/auth-email-errors':helpers,'@supabase/supabase-js':{createClient:()=>({auth:{resetPasswordForEmail:async(...args)=>{sent.push(['recovery',...args]);return{error:recoveryError}}}})},'@/lib/server/require-owner':{requireOwner:async()=>{if(!authorized)throw new Response('Owner required',{status:403});return{admin,user:{id:'owner'},profile:{organization_id:'org'}}},responseFromThrown:e=>e instanceof Response?e:Response.json({error:e.message},{status:500})}});
 return {sent,writes,deny:()=>{authorized=false},post:()=>api.POST(new Request('https://hub.test/api/team-access/resend',{method:'POST',body:JSON.stringify({user_id:'synthetic'})}))};
}
test('a throttle or delivery failure never triggers a second email or a false sent timestamp',async()=>{
 for(const error of [{code:'over_email_send_rate_limit',status:429,message:'email rate limit exceeded'},{code:'over_request_rate_limit',status:429,message:'Too many requests'},{status:500,message:'SMTP unavailable'}]){const f=fixture(error),response=await f.post();assert.equal(response.status,error.status);assert.equal(f.sent.length,1);assert.equal(f.writes.length,0);if(error.status===429)assert.match((await response.json()).error,/temporarily paused/);}
});
test('only an existing auth account falls back to password setup; recovery failures stay failures',async()=>{
 const f=fixture({code:'email_exists',message:'A user with this email address has already been registered'});const response=await f.post();assert.equal(response.status,200);assert.equal((await response.json()).sentAs,'password setup');assert.deepEqual(f.sent.map(x=>x[0]),['invite','recovery']);assert.equal(f.writes.length,2);
 const failed=fixture({code:'user_already_exists'},{status:429,code:'over_email_send_rate_limit'});assert.equal((await failed.post()).status,429);assert.equal(failed.writes.length,0);
});
test('unauthorized, inactive and recently invited accounts send no additional emails',async()=>{
 const denied=fixture();denied.deny();assert.equal((await denied.post()).status,403);assert.equal(denied.sent.length,0);
 const inactive=fixture(null,null,{is_active:false});assert.equal((await inactive.post()).status,400);assert.equal(inactive.sent.length,0);
 const recent=fixture(null,null,{invited_at:new Date().toISOString()});const response=await recent.post();assert.equal(response.status,429);assert.equal(response.headers.get('Retry-After'),'60');assert.equal(recent.sent.length,0);
});

test('pending staff resends use the 48-hour invitation flow instead of the legacy password email',async()=>{
 const f=fixture(null,null,{accepted_at:null});const r=await f.post();assert.equal(r.status,200);assert.equal((await r.json()).validForHours,48);assert.deepEqual(f.sent.map(x=>x[0]),['durable']);
});
