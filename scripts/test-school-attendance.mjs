import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const require=createRequire(import.meta.url),React=require('react');
const url=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const config=url(await readFile('src/lib/location-config.ts','utf8'));
const helpers=await import(url((await readFile('src/lib/transport-child-schools.ts','utf8')).replace('"./location-config"',JSON.stringify(config))));
const trips=await import(url(await readFile('src/lib/transport-trips.ts','utf8')));
const child=(id,ageGroup,grade='',school='')=>({id,legacyId:`synthetic-${id}`,firstName:`Synthetic${id}`,lastName:'Child',ageGroup,dateOfBirth:'',location:'Halcom',enrollmentStatus:'Active',schoolAgeSupport:{grade,schoolName:school}});
test('infants, toddlers and preschoolers without school information are not missing-school cases',()=>{
 for(const group of ['Infant','Toddler','Preschool'])assert.equal(helpers.schoolProfileApplies(child(1,group)),false);
 for(const group of ['Infant','Toddler'])assert.equal(helpers.childSchoolLabel(child(1,group)),'Not attending school');
});
test('TK or an actual school qualifies independently of care age group or a missing birth date',()=>{
 for(const group of ['Preschool','Unknown']){
  const record=child(1,group,'TK');const before=structuredClone(record);
  assert.equal(helpers.schoolProfileApplies(record),true);assert.deepEqual(record,before);
 }
 assert.equal(helpers.schoolProfileApplies(child(1,'Preschool','','Synthetic School')),true);
 assert.equal(helpers.schoolProfileApplies(child(1,'School Age')),true);
});
async function component(path,extra={}) {
 const deps={'next/link':{default:({children,...props})=>React.createElement('a',props,children)},'@/lib/transport-child-schools':helpers,'@/lib/transport-trips':trips,'@/hooks/usePersistentState':{usePersistentState:()=>[[],()=>{},true,{retry(){}}]},'@/lib/hub-data':{starterRoutes:[]},'@/components/providers/AuthProvider':{useAuth:()=>({session:null})},'@/components/hub/HubUI':{inputClass:''},'@/lib/hub-request':{hubRequest(){throw Error('Rendering must not save a child')}} ,...extra};
 const context={exports:{},require:name=>deps[name]||require(name)};
 vm.runInNewContext(ts.transpileModule(await readFile(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
 return context.exports.default;
}
const html=(Component,props)=>require('react-dom/server').renderToStaticMarkup(React.createElement(Component,props));
test('infant profiles have no missing-school prompt; preschool TK profiles retain both trip links',async()=>{
 const Summary=await component('src/components/transportation/ChildTransportSummary.tsx');
 const infant=html(Summary,{child:child(1,'Infant'),canManage:true});
 assert.match(infant,/Not attending school/);assert.doesNotMatch(infant,/School not recorded|Morning drop-off|Afternoon pickup/);
 const tk=html(Summary,{child:child(2,'Preschool','TK'),canManage:true});
 assert.match(tk,/Morning drop-off/);assert.match(tk,/Afternoon pickup/);assert.match(tk,/child=synthetic-2/);
});
test('transportation roster shows unchecked children of any age and hides children explicitly checked off',async()=>{
 const Roster=await component('src/components/transportation/ChildSchoolRoster.tsx');
 const props={roster:[{...child(1,'Infant'),noTransportationNeeded:true},child(2,'Toddler'),child(3,'Preschool'),child(4,'Preschool','TK'),child(5,'School Age'),child(6,'Infant')],schools:[],routes:[{id:1,childId:'synthetic-6',status:'Confirmed',school:'Home Transportation',pickupLocation:'Home',dropoffLocation:'Halcom',tripPeriod:'Afternoon'}],location:'All Locations',canManage:true,onSaved:async()=>{},onAddTrip(){}};
 const result=html(Roster,props);
 assert.doesNotMatch(result,/Synthetic1/);assert.match(result,/Synthetic2/);assert.match(result,/Synthetic3/);assert.match(result,/Synthetic4/);assert.match(result,/Synthetic5/);assert.match(result,/Synthetic6/);
 assert.match(result,/All active children/);
 const focused=html(Roster,{...props,focusChildId:'synthetic-1'});assert.match(focused,/Synthetic1/);assert.match(focused,/Not attending school/);assert.doesNotMatch(focused,/School not recorded/);
});

test('excluded school children keep school details but have no trip links',async()=>{
 const Summary=await component('src/components/transportation/ChildTransportSummary.tsx');
 const result=html(Summary,{child:{...child(1,'Preschool','TK','Synthetic School'),noTransportationNeeded:true},canManage:true});
 assert.match(result,/Synthetic School/);assert.match(result,/No transportation needed/);assert.doesNotMatch(result,/Morning drop-off|Afternoon pickup/);
});
test('checking a child off saves their stable identity, removes them, and the excluded view can restore them',async()=>{
 let cursor=0;const states=[],requests=[];
 const record=child(1,'Infant');let excluded=false;
 const react={useState(initial){const slot=cursor++;if(!(slot in states))states[slot]=initial;return[states[slot],value=>states[slot]=typeof value==='function'?value(states[slot]):value]}};
 const Roster=await component('src/components/transportation/ChildSchoolRoster.tsx',{react,'@/components/providers/AuthProvider':{useAuth:()=>({session:{access_token:'synthetic-token'}})},'@/lib/hub-request':{async hubRequest(path,token,options){const body=JSON.parse(options.body);requests.push({path,body});excluded=body.excluded;}}});
 const props={roster:[record],schools:[],routes:[],location:'All Locations',canManage:true,onSaved:async()=>{record.noTransportationNeeded=excluded},onAddTrip(){throw Error('No trip should be added')}};
 const flat=node=>Array.isArray(node)?node.flatMap(flat):node&&typeof node==='object'?[node,...flat(node.props?.children)]:[];
 const render=()=>{cursor=0;return flat(Roster(props))};
 const checkbox=nodes=>nodes.find(node=>node.type==='input'&&node.props.type==='checkbox');
 checkbox(render()).props.onChange({target:{checked:true}});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(requests[0].path,'/api/transportation-setup');assert.deepEqual(requests[0].body,{action:'transportation-needed',childId:'synthetic-1',excluded:true,expectedExcluded:false});
 assert.equal(checkbox(render()),undefined);assert.equal(record.enrollmentStatus,'Active');
 render().find(node=>node.type==='select'&&node.props['aria-label']==='Children to show').props.onChange({target:{value:'excluded'}});
 assert.equal(checkbox(render()).props.checked,true);
 checkbox(render()).props.onChange({target:{checked:false}});await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(requests[1].body,{action:'transportation-needed',childId:'synthetic-1',excluded:false,expectedExcluded:true});assert.equal(checkbox(render()),undefined);
 render().find(node=>node.type==='select'&&node.props['aria-label']==='Children to show').props.onChange({target:{value:'transportation'}});assert.equal(checkbox(render()).props.checked,false);
 props.canManage=false;assert.equal(checkbox(render()),undefined);
});
test('transportation preference endpoint requires manager access and a boolean preference',async()=>{
 let calls=[];let src=await readFile('src/app/api/transportation-setup/route.ts','utf8');
 src=src.replace(/import \{ requireStaff, staffErrorResponse \} from .*?;/,'const requireStaff=async()=>globalThis.__transportPreferenceAuth;const staffErrorResponse=e=>Response.json({error:String(e)},{status:500});').replace(/import \{ flushTransportAssignmentNotices \} from .*?;/,'const flushTransportAssignmentNotices=async()=>{};');
 const api=await import(url(src));globalThis.__transportPreferenceAuth={isOwner:true,userClient:{rpc:async(name,args)=>{calls.push({name,args});return {data:1}}}};
 const post=body=>api.POST(new Request('https://synthetic.invalid/api/transportation-setup',{method:'POST',body:JSON.stringify(body)}));
 const body={action:'transportation-needed',childId:'synthetic-1',excluded:true,expectedExcluded:false};
 assert.equal((await post(body)).status,200);assert.equal(calls[0].name,'set_child_transportation_exclusion');
 assert.equal((await post({...body,excluded:'true'})).status,400);assert.equal(calls.length,1);
 globalThis.__transportPreferenceAuth.isOwner=false;assert.equal((await post(body)).status,403);assert.equal(calls.length,1);
});
