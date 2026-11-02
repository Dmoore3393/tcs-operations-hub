import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import {createClient} from '@supabase/supabase-js';
const url=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64');
const sessionModule=await import(url(await readFile('src/lib/invitation-session.ts','utf8')));const {prepareInvitationSession,InvitationSessionError}=sessionModule;
const user={id:'synthetic-staff',email:'synthetic@example.invalid',aud:'authenticated',user_metadata:{},app_metadata:{},created_at:'2026-01-01'};
const jwt=expires=>Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,exp:expires,aud:'authenticated'})).toString('base64url')+'.synthetic-signature';
const fresh=()=>({access_token:jwt(Math.floor(Date.now()/1000)+3600),refresh_token:'synthetic-refresh',token_type:'bearer',expires_in:3600,user});
function setup({expired=false,rejected=false,stored=null}={}){
 const expected=fresh();if(expired)expected.access_token=jwt(1);const requests=[];
 const isolated=createClient('https://auth.example.invalid','synthetic-public-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(input,init)=>{const request=new Request(input,init);const path=new URL(request.url).pathname;requests.push({path,method:request.method,authorization:request.headers.get('authorization')});if(path.endsWith('/token'))return Response.json(rejected?{error:'invalid_grant',error_code:'refresh_token_not_found',msg:'Invalid refresh token'}:{...fresh()},{status:rejected?400:200});return Response.json(user);}}});
 const browser={auth:{getSession:async()=>({data:{session:stored},error:null})}};return{browser,isolated,expected,requests};
}
test('a browser that lost persisted auth can finish password setup with verified in-memory tokens',async()=>{
 const c=setup();const verified=await prepareInvitationSession(c.browser,c.isolated,c.expected);assert.equal(verified.user.id,user.id);const result=await c.isolated.auth.updateUser({password:'synthetic-test-only-password'});assert.equal(result.error,null);assert.ok(c.requests.some(request=>request.method==='PUT'&&request.path.endsWith('/user')));assert.ok(c.requests.every(request=>request.authorization==='Bearer '+verified.access_token));
});
test('expired invitation tokens refresh before activation, while revoked tokens show a fresh-link message',async()=>{
 let c=setup({expired:true});const session=await prepareInvitationSession(c.browser,c.isolated,c.expected);assert.notEqual(session.access_token,c.expected.access_token);assert.ok(c.requests.some(request=>request.path.endsWith('/token')));
 c=setup({expired:true,rejected:true});await assert.rejects(prepareInvitationSession(c.browser,c.isolated,c.expected),InvitationSessionError);assert.ok(!c.requests.some(request=>request.method==='PUT'));
});
test('an invitation never updates another signed-in account',async()=>{
 const other={...fresh(),user:{...user,id:'another-account'}};const c=setup({stored:other});await assert.rejects(prepareInvitationSession(c.browser,c.isolated,c.expected),InvitationSessionError);assert.equal(c.requests.length,0);
});
test('missing token pairs cannot reach a password change',async()=>{
 const c=setup();await assert.rejects(prepareInvitationSession(c.browser,c.isolated,{...c.expected,refresh_token:''}),InvitationSessionError);assert.equal(c.requests.length,0);
});

async function setupPage({missing=false,activationFailsOnce=false,storageFails=false}={}){
 const {createRequire}=await import('node:module'),{default:vm}=await import('node:vm');const require=createRequire(import.meta.url);const contact=await import(url(await readFile('src/lib/staff-contact.ts','utf8')));let cursor=0,attempt=0;const slots=[],calls=[];
 const initial=fresh();initial.user={...user,user_metadata:{tcs_staff_contact:{first_name:'Synthetic',last_name:'Staff',phone:'6615550123',birthday_month:'',birthday_day:''}}};
 const latest={...fresh(),access_token:'synthetic-refreshed-access'};
 const react={useState(initial){const slot=cursor++;if(!(slot in slots))slots[slot]=typeof initial==='function'?initial():initial;return[slots[slot],value=>slots[slot]=typeof value==='function'?value(slots[slot]):value]},useRef(initial){const slot=cursor++;if(!(slot in slots))slots[slot]={current:initial};return slots[slot]},useEffect(){}};
 const isolated={auth:{updateUser:async()=>{calls.push('password');return{error:null}},getSession:async()=>({data:{session:latest}})}};
 const browser={auth:{getSession:async()=>({data:{session:latest}}),setSession:async()=>{calls.push('restore');return{error:storageFails?new Error('Storage unavailable'):null}},resetPasswordForEmail:async()=>{calls.push('request-link');return{error:null}}}};
 const deps={react,'next/link':'a','next/navigation':{useRouter:()=>({replace(){calls.push('navigate')},refresh(){}})},'@/components/providers/AuthProvider':{useAuth:()=>({session:missing?null:initial,profile:missing?null:{full_name:'Synthetic Staff',email:user.email,role:'Employee',locations:[]},loading:false,refreshProfile:async()=>calls.push('profile'),signOut(){}})},'@/components/StaffContactFields':()=>null,'@/lib/staff-contact':contact,'@/lib/supabase/client':{supabase:browser,createInvitationClient:()=>isolated},'@/lib/invitation-session':{InvitationSessionError,prepareInvitationSession:async()=>{calls.push('verify');return latest}},'@/lib/hub-request':{hubRequest:async(_url,token)=>{calls.push(['activate',token]);if(activationFailsOnce&&attempt++===0)throw Error('Synthetic connection interrupted');}}};
 const context={exports:{},window:{setTimeout(){}},require:name=>deps[name]||require(name)};vm.runInNewContext(ts.transpileModule(await readFile('src/app/(portal)/accept-invite/page.tsx','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
 const flatten=node=>Array.isArray(node)?node.flatMap(flatten):node&&typeof node==='object'?[node,...flatten(node.props?.children)]:[];const render=()=>{cursor=0;return flatten(context.exports.default());};
 function fill(){let tree=render();for(const input of tree.filter(node=>node.type==='input'&&node.props.type==='password'))input.props.onChange({target:{value:'synthetic-test-password'}});}
 async function submit(){const tree=render();await tree.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});return render();}
 return{render,fill,submit,calls};
}
test('setup activation uses the fresh token and retries without changing an already saved password twice',async()=>{
 const page=await setupPage({activationFailsOnce:true});page.fill();let nodes=await page.submit();assert.equal(page.calls.filter(call=>call==='password').length,1);assert.ok(nodes.some(node=>node.props?.role==='alert'));
 nodes=await page.submit();assert.equal(page.calls.filter(call=>call==='password').length,1);assert.ok(page.calls.filter(call=>Array.isArray(call)&&call[0]==='activate').every(call=>call[1]==='synthetic-refreshed-access'));assert.ok(nodes.some(node=>node.type==='h1'&&node.props.children==='Account activated!'));
});
test('signed-out setup shows a fresh-link request before contact or password fields',async()=>{
 const page=await setupPage({missing:true});const nodes=page.render();assert.ok(nodes.some(node=>node.props?.children==='Request new setup email'));assert.ok(!nodes.some(node=>node.type==='input'&&node.props.type==='password'));
});
test('an activated account with unavailable storage gets a sign-in option instead of a false activation failure',async()=>{
 const page=await setupPage({storageFails:true});page.fill();const nodes=await page.submit();assert.ok(nodes.some(node=>node.type==='h1'&&node.props.children==='Account activated!'));assert.ok(nodes.some(node=>node.props?.children==='Your account is activated. Sign in with the password you just created.'));
});
