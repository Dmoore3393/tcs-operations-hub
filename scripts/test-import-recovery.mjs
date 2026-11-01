import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import vm from 'node:vm';
const compile=(path)=>ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const draftContext={exports:{}};vm.runInNewContext(compile('src/lib/brightwheel-import-draft.ts'),draftContext);const draftApi=draftContext.exports;
const memory=()=>{const map=new Map();return {get length(){return map.size},key:i=>[...map.keys()][i],getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}};
const choice={include:false,location:'Synthetic Care',funding:'CCCC',fundingLocation:'Synthetic Funding',fundingLocationChanged:true,matchId:'synthetic-existing'};
const draft={fileName:'synthetic.csv',csvText:'Synthetic roster only',defaultLocation:'Synthetic Care',defaultFunding:'',activeOnly:false,rowSettings:{'bw-row-2':choice}};
test('tab recovery retains unchecked children and all review choices across a fresh read',()=>{
 const storage=memory();assert.equal(draftApi.saveImportDraft(storage,'user','org',draft,100),true);
 const recovered=draftApi.readImportDraft(storage,'user','org',101);assert.equal(JSON.stringify(recovered),JSON.stringify(draft));
 const refreshed=draftApi.reconcileImportReview([{rowKey:'bw-row-2',include:true,selectedLocation:'Different default',selectedFunding:'Cash Pay',selectedFundingLocation:''}],recovered.rowSettings);
 assert.equal(JSON.stringify(refreshed['bw-row-2']),JSON.stringify(choice));
 assert.equal(draftApi.readImportDraft(storage,'other-user','org',101),null);assert.equal(draftApi.readImportDraft(storage,'user','other-org',101),null);
});
test('successful import, sign-out and expiry remove recovery without touching unrelated tab data',()=>{
 const storage=memory();draftApi.saveImportDraft(storage,'user','org',draft,100);draftApi.saveImportDraft(storage,'user','org',null,101);assert.equal(storage.length,0);
 draftApi.saveImportDraft(storage,'user','org',draft,100);assert.equal(draftApi.readImportDraft(storage,'user','org',100+9*60*60*1000),null);assert.equal(storage.length,0);
 storage.setItem('unrelated','keep');draftApi.saveImportDraft(storage,'user','org',draft,100);draftApi.clearImportDrafts(storage);assert.equal(storage.length,1);assert.equal(storage.getItem('unrelated'),'keep');
 assert.equal(draftApi.saveImportDraft({setItem(){throw Error('quota')},removeItem(){}},'user','org',draft),false);
});
function authHarness(){
 const provider=Symbol('Provider'),loadingScreen=Symbol('Loading');const values=[],refs=[],effects=[],timers=[];let stateIndex=0,refIndex=0,authEvent;
 const currentSession={user:{id:'user',email:'synthetic@example.invalid'},access_token:'synthetic'};
 const profile={user_id:'user',role:'Owner / Admin',organization_id:'org',permissions:[],locations:[],accepted_at:'2026-01-01'};
 values.push(currentSession,profile,false,false,'');
 const context={exports:{},Response,Promise,process:{env:{}},fetch:async()=>new Response(JSON.stringify({profile}),{headers:{'content-type':'application/json'}}),require(name){
  if(name==='react')return {createContext:()=>({Provider:provider}),useState:initial=>{const i=stateIndex++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;return [values[i],v=>values[i]=typeof v==='function'?v(values[i]):v]},useRef:initial=>{const i=refIndex++;return refs[i]??=( {current:initial})},useEffect:fn=>effects.push(fn),useCallback:fn=>fn,useMemo:fn=>fn()};
  if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
  if(name==='@/lib/supabase/client')return {isSupabaseConfigured:true,supabase:{auth:{getSession:()=>new Promise(()=>{}),onAuthStateChange:fn=>{authEvent=fn;return {data:{subscription:{unsubscribe(){}}}}}}}};
  if(name==='@/hooks/useHubPathname')return {useHubPathname:()=>'/children/import-brightwheel'};
  if(name==='next/navigation')return {useRouter:()=>({replace(){}})};
  if(name==='@/lib/access-check')return {readAccessCheck:response=>response.json()};
  if(name==='@/lib/team-access')return {normalizeAccessRole:v=>v,isOwnerAccessRole:()=>true,isLicenseeAccessRole:()=>false,isEmployeeAccessRole:()=>false,isSupportedAccessRole:()=>true};
  if(name==='@/components/pwa/AppLoadingScreen')return {default:loadingScreen};
  return {};
 },window:{setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout(){},sessionStorage:memory()}};
 vm.runInNewContext(compile('src/components/providers/AuthProvider.tsx'),context);
 const child={importChoices:'kept'};
 const render=()=>{stateIndex=0;refIndex=0;return context.exports.AuthProvider({children:child})};
 render();effects[0]();
 return {render,values,provider,loadingScreen,child,event:(event,session)=>authEvent(event,session),session:currentSession,timers};
}
test('actual AuthProvider keeps the same import child mounted during token refresh and focus sign-in',()=>{
 const h=authHarness();for(const event of ['TOKEN_REFRESHED','SIGNED_IN']){
 h.event(event,h.session);const rendered=h.render();assert.equal(h.values[2],true);assert.equal(rendered.type,h.provider);assert.equal(rendered.props.children,h.child);
 }
});
test('a different account or missing verified profile still blocks the child screen',()=>{
 const h=authHarness();h.event('SIGNED_IN',{user:{id:'other'},access_token:'other'});assert.equal(h.render().type,h.loadingScreen);
 h.values[1]=null;assert.equal(h.render().type,h.loadingScreen);
});
test('actual import page keeps unchecked rows through preview, reload recovery and the final request',async()=>{
 const identityContext={exports:{}};vm.runInNewContext(compile('src/lib/brightwheel-identity.ts'),identityContext);
 const storage=memory(),requests=[];
 const rows=[2,3].map(n=>({rowKey:`bw-row-${n}`,rowNumber:n,firstName:'Synthetic',lastName:`Child${n}`,dateOfBirth:'',room:'',enrollmentStatus:'Active',primaryGuardian:'',selectedLocation:'Synthetic Care',selectedFunding:'',selectedFundingLocation:'',matchType:'new',candidates:[],allowNew:false,blocked:false,warnings:[],ready:true,include:true}));
 function page(){
  const states=[],effects=[];let index=0;
  const context={exports:{},window:{sessionStorage:storage,setTimeout:()=>1,clearTimeout(){},addEventListener(){},removeEventListener(){}},require(name){
   if(name==='react')return {useState:initial=>{const i=index++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v]},useEffect:fn=>effects.push(fn),useMemo:fn=>fn()};
   if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
   if(name==='@/components/providers/AuthProvider')return {useAuth:()=>({session:{user:{id:'user'},access_token:'synthetic'},profile:{organization_id:'org'}})};
   if(name==='@/lib/brightwheel-import-draft')return draftApi;
   if(name==='@/lib/brightwheel-identity')return identityContext.exports;
   if(name==='@/lib/children')return {locations:['Synthetic Care','Synthetic Funding'],fundingSources:['CCCC']};
   if(name==='@/lib/hub-request')return {hubRequest:async(path,token,options)=>{const body=JSON.parse(options.body);requests.push(body);return body.mode==='preview'?{rows,previewToken:'synthetic-token',totals:{fileRows:2,activeRows:2,excludedRows:0,newRows:2,updateRows:0,needsAttention:0}}:{inserted:1,updated:0,skipped:1,message:'Synthetic result'}}};
   return {};
  }};
  vm.runInNewContext(compile('src/app/(portal)/children/import-brightwheel/page.tsx'),context);
  let tree;
  const render=()=>{index=0;effects.length=0;tree=context.exports.default();effects.forEach(fn=>fn());return tree};
  function all(node){if(Array.isArray(node))return node.flatMap(n=>all(n));if(!node||typeof node!=='object')return [];return [node,...all(node.props?.children)];}
  return {render,all:()=>all(tree),find:predicate=>all(tree).find(predicate)};
 }
 const tick=()=>new Promise(resolve=>setImmediate(resolve));
 let p=page();p.render();p.find(n=>n.type==='input'&&n.props.type==='file').props.onChange({target:{files:[{name:'synthetic.csv',size:100,text:async()=> 'Synthetic roster'}]}});await tick();p.render();
 p.find(n=>n.type==='button'&&JSON.stringify(n.props.children).includes('Preview Brightwheel')).props.onClick();await tick();p.render();
 p.find(n=>n.props?.['aria-label']==='Include Synthetic Child2').props.onChange({target:{checked:false}});p.render();
 p.find(n=>n.props?.['aria-label']==='Funding location for Synthetic Child3').props.onChange({target:{value:'Synthetic Funding'}});p.render();
 p.find(n=>n.type==='button'&&JSON.stringify(n.props.children).includes('Refresh Preview')).props.onClick();await tick();p.render();
 assert.equal(p.find(n=>n.props?.['aria-label']==='Include Synthetic Child2').props.checked,false);
 // A new page instance models a full reload. It recovers choices, but never submits.
 const before=requests.length;p=page();p.render();assert.equal(requests.length,before);assert.equal(p.find(n=>n.props?.['aria-label']==='Include Synthetic Child2'),undefined);
 p.find(n=>n.type==='button'&&JSON.stringify(n.props.children).includes('Preview Brightwheel')).props.onClick();await tick();p.render();
 assert.equal(p.find(n=>n.props?.['aria-label']==='Include Synthetic Child2').props.checked,false);
 assert.equal(p.find(n=>n.props?.['aria-label']==='Funding location for Synthetic Child3').props.value,'Synthetic Funding');
 p.find(n=>n.type==='button'&&JSON.stringify(n.props.children).includes('Import 1 Children')).props.onClick();await tick();p.render();
 const commit=requests.find(r=>r.mode==='commit');assert.deepEqual(commit.selectedRowKeys,['bw-row-3']);assert.equal(commit.overrides.find(r=>r.rowKey==='bw-row-2').include,false);
 assert.equal(draftApi.readImportDraft(storage,'user','org'),null);
});
