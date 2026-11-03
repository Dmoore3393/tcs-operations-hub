import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const url=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64');
const {groupSchoolPickupStops,mergeSchoolStopRows,childForSchoolRoute}=await import(url(await readFile('src/lib/school-pickup-stops.ts','utf8')));
const base={id:1,childId:'first-child',child:'Synthetic First',location:'Halcom',school:'Synthetic Elementary',driver:'Synthetic Driver',vehicle:'Synthetic Van',routeName:'Synthetic Route',pickup:'2:33 PM',days:'Mon-Fri',area:'Lancaster',dropoff:'',status:'Confirmed',notes:'First child private instructions',dropoffLocation:'Halcom'};
test('one school stop can carry several children to different destinations without merging child identities',()=>{
 const rows=[base,{...base,id:2,childId:'second-child',child:'Synthetic Second',location:'42nd Street',dropoffLocation:'42nd Street'}];const groups=groupSchoolPickupStops(rows);assert.equal(groups.length,1);assert.equal(groups[0].routes.length,2);assert.deepEqual(groups[0].routes.map(route=>route.dropoffLocation),['Halcom','42nd Street']);assert.equal(groupSchoolPickupStops([...rows,{...base,id:3,pickup:'3:05 PM'}]).length,2);assert.equal(groupSchoolPickupStops([...rows,{...base,id:3,driver:'Another Driver'}]).length,2);
});
test('editing a school stop retains per-child custody history and leaves unrelated routes intact',()=>{
 const history=[{date:'2030-01-07',status:'Picked Up'}];const current=[{...base,runHistory:history,runStatus:'Picked Up'}, {...base,id:9,school:'Another School'}];const result=mergeSchoolStopRows(current,[{...base,dropoffLocation:'Division'},{...base,id:2,childId:'second-child',child:'Synthetic Second',dropoffLocation:'42nd Street'}]);assert.equal(result.length,3);assert.equal(result[0].id,1);assert.equal(result[0].dropoffLocation,'Division');assert.deepEqual(result[0].runHistory,history);assert.equal(result[0].runStatus,'Picked Up');assert.equal(result[1],current[1]);
});
test('child IDs select the correct emergency and attendance profile even when children have the same name',()=>{
 const children=[{id:1,legacyId:'first-child',firstName:'Same',lastName:'Name'},{id:2,legacyId:'second-child',firstName:'Same',lastName:'Name'}];assert.equal(childForSchoolRoute({...base,child:'Same Name',childId:'second-child'},children).id,2);assert.equal(childForSchoolRoute({...base,child:'Same Name',childId:undefined},children),undefined);assert.equal(childForSchoolRoute({...base,child:'Same Name',childId:'missing'},children),undefined);
});
async function editor(routes=[]){
 const {createRequire}=await import('node:module'),{default:vm}=await import('node:vm');const require=createRequire(import.meta.url);let cursor=0,nextId=100,saved;const states=[];
 const react={useState(initial){const slot=cursor++;if(!(slot in states))states[slot]=typeof initial==='function'?initial():initial;return[states[slot],value=>states[slot]=typeof value==='function'?value(states[slot]):value]}};
 const children=[{id:1,legacyId:'first-child',firstName:'Synthetic',lastName:'First',location:'Halcom',enrollmentStatus:'Active'},{id:2,legacyId:'second-child',firstName:'Synthetic',lastName:'Second',location:'42nd Street',enrollmentStatus:'Active'},{id:3,legacyId:'third-child',firstName:'Synthetic',lastName:'Third',location:'Division',enrollmentStatus:'Active'}];
 const props={routes,roster:children,schools:[],vehicles:[],locations:['Halcom','42nd Street','Division'],onClose(){},onSave:rows=>saved=rows};
 const deps={'@/components/forms/ChoiceSelect':{default:props=>require('react').createElement('select',{'aria-label':props.label,value:props.value,onChange:event=>props.onChange(event.target.value)})},'@/lib/form-options':{weekdayChoices:[],pickupAreaChoices:[]},'./TransportDriverSelect':{default:()=>null},'./TransportSchoolSelect':{default:()=>null},react,'@/components/hub/HubUI':{Modal:()=>null,inputClass:''},'@/lib/transport-child-schools':{transportCareLocation:value=>value,transportChildKey:child=>child.legacyId||String(child.id),childSchool:child=>child.schoolAgeSupport?.schoolName||'',childSchoolLabel:child=>child.schoolAgeSupport?.schoolName||'Not attending school / not recorded'},'@/lib/school-pickup-stops':{newSchoolRouteId:()=>nextId++}};const context={exports:{},crypto:{randomUUID:()=> 'synthetic-stop'},require:name=>deps[name]||require(name)};
 vm.runInNewContext(ts.transpileModule(await readFile('src/components/transportation/SchoolStopEditor.tsx','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
 const flatten=node=>Array.isArray(node)?node.flatMap(flatten):node&&typeof node==='object'?[node,...flatten(node.props?.children)]:[];const render=()=>{cursor=0;return flatten(context.exports.default(props));};return{render,get saved(){return saved;}};
}
test('multi-child selection saves each destination separately and never adds an unchecked child',async()=>{
 const page=await editor();let nodes=page.render();nodes.filter(node=>node.type==='input'&&node.props.type==='checkbox')[0].props.onChange();nodes=page.render();nodes.filter(node=>node.type==='input'&&node.props.type==='checkbox')[1].props.onChange();nodes=page.render();const destination=nodes.find(node=>node.props?.label==='Drop-off location'&&node.props.value==='42nd Street');destination.props.onChange('Division');nodes=page.render();nodes.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});assert.equal(page.saved.length,2);assert.deepEqual(Array.from(page.saved,row=>row.childId),['first-child','second-child']);assert.deepEqual(Array.from(page.saved,row=>row.dropoffLocation),['Halcom','Division']);assert.equal(page.saved[1].location,'42nd Street');assert.equal(page.saved[0].pickupStopId,page.saved[1].pickupStopId);
});
test('adding a child to an existing school stop preserves IDs, individual notes and destinations',async()=>{
 const existing=[base,{...base,id:2,childId:'second-child',child:'Synthetic Second',location:'42nd Street',dropoffLocation:'42nd Street',notes:'Second child separate instructions'}];const page=await editor(existing);let nodes=page.render();nodes.find(node=>node.type==='input'&&node.props.type==='checkbox').props.onChange();nodes=page.render();nodes.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});assert.equal(page.saved.length,3);assert.deepEqual(Array.from(page.saved,row=>row.id).slice(0,2),[1,2]);assert.equal(page.saved[0].notes,existing[0].notes);assert.equal(page.saved[1].notes,existing[1].notes);assert.equal(page.saved[1].dropoffLocation,'42nd Street');
});

test('morning school drop-offs keep child identity and pickup sources separate from afternoon routes',async()=>{
 const page=await editor();let nodes=page.render();nodes.find(node=>node.type==='select'&&node.props['aria-label']==='Transportation session').props.onChange({target:{value:'Morning'}});nodes=page.render();nodes.find(node=>node.type==='input'&&node.props.placeholder==='Example: 7:45 AM').props.onChange({target:{value:'7:45 AM'}});nodes=page.render();nodes.filter(node=>node.type==='input'&&node.props.type==='checkbox')[0].props.onChange();nodes=page.render();nodes.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});
 assert.equal(page.saved[0].tripPeriod,'Morning');assert.equal(page.saved[0].pickupLocation,'Halcom');assert.equal(page.saved[0].dropoff,'7:45 AM');assert.equal(page.saved[0].childId,'first-child');assert.notEqual(page.saved[0].id,base.id);
 assert.equal(groupSchoolPickupStops([base,{...base,id:99,tripPeriod:'Morning',pickupLocation:'Halcom'}]).length,2);
});

test('school stops ignore old group names while preserving separate drivers, times and per-child destinations',()=>{
 const first={...base,routeName:'Old Group A'},second={...base,id:2,childId:'second-child',routeName:'Old Group B',location:'42nd Street',dropoffLocation:'42nd Street'};
 const groups=groupSchoolPickupStops([first,second],true);assert.equal(groups.length,1);assert.equal(groups[0].routes.length,2);assert.equal(second.routeName,'Old Group B');
 for(const change of [{school:'Another School'},{tripPeriod:'Morning',pickupLocation:'Halcom'},{driver:'Other Driver'},{vehicle:'Other Van'},{pickup:'3:00 PM'},{days:'Saturday'}])assert.equal(groupSchoolPickupStops([first,{...second,...change}],true).length,2);
});
test('school-trip form needs no separate group name, and saves the selected children without inventing one',async()=>{
 const page=await editor();let nodes=page.render();assert.equal(nodes.some(node=>node.props?.label==='Route / group name'),false);
 nodes.find(node=>node.type==='input'&&node.props.type==='checkbox').props.onChange();nodes=page.render();nodes.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});
 assert.equal(page.saved.length,1);assert.equal(page.saved[0].routeName,undefined);assert.equal(page.saved[0].childId,'first-child');
});
test('school labels do not split children by old group names or care destinations, while staff duty references stay stable',async()=>{
 const {transportRouteGroup,transportCoverageGroup,transportEmergencyGroup}=await import(url(await readFile('src/lib/transport-trips.ts','utf8')));
 const first={...base,routeName:'Old Group A'},second={...base,id:2,routeName:'Old Group B',location:'42nd Street'};
 assert.equal(transportRouteGroup(first),transportRouteGroup(second));assert.match(transportRouteGroup(first),/Synthetic Elementary/);assert.doesNotMatch(transportRouteGroup(first),/Old Group/);
 assert.notEqual(transportRouteGroup(first),transportRouteGroup({...first,school:'Another School'}));
 assert.notEqual(transportRouteGroup(first),transportRouteGroup({...first,driver:'Other Driver'}));
 assert.equal(transportCoverageGroup(first),'Old Group A');assert.equal(transportCoverageGroup({...first,tripPeriod:'Morning'}),'Morning • Old Group A');assert.equal(transportEmergencyGroup({...first,tripPeriod:'Morning'}),'Old Group A');
});

test('emergency-card link includes every child group at a school stop and resolves date-specific overrides by route ID',async()=>{
 const {transportEmergencyHref}=await import(url(await readFile('src/lib/transport-trips.ts','utf8')));
 const recurring=[{...base,routeName:'Legacy A'},{...base,id:2,routeName:'Legacy B'},{...base,id:3,routeName:'',driver:'Original Driver'}];
 const selected=recurring.map(route=>({...route,driver:'Covering Driver',school:'Another School'}));
 const link=transportEmergencyHref(selected,recurring),query=new URL(link,'https://synthetic.invalid').searchParams;
 assert.deepEqual(query.getAll('route'),['Legacy A','Legacy B','Halcom • Original Driver']);
 assert.equal(transportEmergencyHref([]),'/emergency-cards');assert.equal(new URL(transportEmergencyHref([recurring[0],recurring[0]],recurring),'https://synthetic.invalid').searchParams.getAll('route').length,1);
});
