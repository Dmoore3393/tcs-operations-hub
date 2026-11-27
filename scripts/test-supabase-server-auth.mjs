import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import {createClient} from '@supabase/supabase-js';
const require=createRequire(import.meta.url);
function load(path,deps={},extra={}){
 const context={exports:{},Headers,Request,fetch,process,require:name=>Object.hasOwn(deps,name)?deps[name]:require(name),...extra};
 vm.runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
 return context.exports;
}
const {serverApiKeyFetch}=load('src/lib/supabase/server-fetch.ts');
const key='sb_secret_synthetic_not_a_real_key';
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
test('reproduce real SDK staff lookup rejection, then verify apikey-only transport succeeds',async()=>{
 const seen=[];
 const gateway=async(input,init)=>{
  const headers=new Headers(init?.headers);seen.push(headers);
  assert.equal(headers.get('apikey'),key);
  if(headers.has('Authorization'))return Response.json({code:'PGRST303',message:'JWT claims validation failed'},{status:401});
  return Response.json([{user_id:'synthetic-staff',role:'Owner / Admin',is_active:true}]);
 };
 const before=createClient('https://synthetic.supabase.co',key,{...options,global:{fetch:gateway}});
 const rejected=await before.from('staff_access').select('user_id,role,is_active');
 assert.equal(rejected.error.code,'PGRST303');assert.equal(seen[0].get('Authorization'),`Bearer ${key}`);
 const after=createClient('https://synthetic.supabase.co',key,{...options,global:{fetch:serverApiKeyFetch(gateway)}});
 const accepted=await after.from('staff_access').select('user_id,role,is_active');
 assert.equal(accepted.error,null);assert.equal(accepted.data[0].user_id,'synthetic-staff');assert.equal(seen[1].has('Authorization'),false);
});
test('actual server factory keeps verified user JWTs for getUser and removes only the opaque key bearer from database calls',async()=>{
 const calls=[];
 const transport=async(input,init)=>{
  const headers=new Headers(init?.headers);calls.push({url:String(input),headers});
  if(String(input).includes('/auth/v1/user')){
   assert.equal(headers.get('Authorization'),'Bearer synthetic-user-jwt');
   return Response.json({id:'synthetic-staff',email:'fixture@example.test'});
  }
  assert.equal(headers.has('Authorization'),false);assert.equal(headers.get('apikey'),key);
  return Response.json([{user_id:'synthetic-staff'}]);
 };
 const factory=load('src/lib/supabase/admin.ts',{'server-only':{},'@/lib/supabase/server-fetch':{serverApiKeyFetch:()=>serverApiKeyFetch(transport)}},{process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:key}}});
 const admin=factory.createSupabaseAdminClient();
 assert.equal((await admin.auth.getUser('synthetic-user-jwt')).data.user.id,'synthetic-staff');
 assert.equal((await admin.from('staff_access').select('user_id')).error,null);assert.equal(calls.length,2);
});
test('transport preserves legacy JWT authorization, distinct bearer tokens and Request bodies/signals without modifying caller headers',async()=>{
 for(const [apiKey,bearer] of [['legacy.jwt.key','legacy.jwt.key'],[key,'signed.user.jwt'],['sb_publishable_synthetic','signed.user.jwt']]){
  const headers=new Headers({apikey:apiKey,Authorization:`Bearer ${bearer}`,'Content-Type':'application/json'});
  const controller=new AbortController();
  await serverApiKeyFetch(async(input,init)=>{
   assert.equal(new Headers(init.headers).get('Authorization'),`Bearer ${bearer}`);assert.equal(init.body,'{"value":1}');assert.equal(init.signal,controller.signal);assert.equal(init.method,'POST');return Response.json({ok:true});
  })('https://synthetic.supabase.co/rest/v1/rpc/action',{headers,method:'POST',body:'{"value":1}',signal:controller.signal});
  assert.equal(headers.get('Authorization'),`Bearer ${bearer}`);
 }
 const request=new Request('https://synthetic.supabase.co/rest/v1/items',{headers:{apikey:key,Authorization:`Bearer ${key}`},method:'POST',body:'{"value":1}'});
 await serverApiKeyFetch(async(input,init)=>{
  assert.equal(input,request);assert.equal(new Headers(init.headers).has('Authorization'),false);assert.equal(await input.text(),'{"value":1}');return Response.json({ok:true});
 })(request);
 assert.equal(request.headers.get('Authorization'),`Bearer ${key}`);
});
