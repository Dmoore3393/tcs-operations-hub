import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const require=createRequire(import.meta.url),React=require('react');
const url=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64');
const driver=await import(url(await readFile('src/lib/transport-driver-view.ts','utf8')));
const daily=await import(url(await readFile('src/lib/transportation-day.ts','utf8')));
const trips=await import(url(await readFile('src/lib/transport-trips.ts','utf8')));
const stops=await import(url(await readFile('src/lib/school-pickup-stops.ts','utf8')));
const handoff=await import(url(await readFile('src/lib/transport-care-handoff.ts','utf8')));
const day='2030-01-07',staff=[{id:'mine',name:'Synthetic Driver'},{id:'other',name:'Other Driver'}];
const base={id:1,childId:'child-1',child:'Synthetic Halcom Child',location:'Halcom',driver:'Synthetic Driver',driverLaneId:'mine',school:'Synthetic Sierra',vehicle:'Synthetic Van',pickup:'12:05 PM',dropoff:'',days:'Mon-Fri',status:'Confirmed',notes:'',area:'Lancaster',tripPeriod:'Afternoon'};
const rows=[base,
 {...base,id:2,childId:'child-2',child:'Synthetic 42nd Child',location:'42nd Street',dropoffLocation:'42nd Street',school:'Synthetic Valley',pickup:'1:40 PM'},
 {...base,id:3,childId:'child-3',child:'Synthetic Division Child',location:'Division'},
 {...base,id:4,childId:'child-4',child:'Other Driver Child',location:'33rd Street',driver:'Other Driver',driverLaneId:'other'},
 {...base,id:5,childId:'child-5',child:'Synthetic Morning Child',tripPeriod:'Morning',pickup:'7:05 AM',pickupLocation:'Halcom'},
 {...base,id:6,childId:'child-6',child:'Synthetic Out Sick Child',location:'42nd Street'},
 {...base,id:7,childId:'child-7',child:'Synthetic Covering Child',location:'33rd Street',driver:'Other Driver',driverLaneId:'other',coveringDriver:'Synthetic Driver',coveringDate:day},
 {...base,id:8,childId:'child-8',child:'Covered By Other Child',coveringDriver:'Other Driver',coveringDate:day},
 {...base,id:9,childId:'child-9',child:'Reassigned Away Child'},
 {...base,id:10,childId:'child-10',child:'Reassigned To Me Child',driver:'Other Driver',driverLaneId:'other'},
];
const overrides=[
 {route_id:'r6',service_date:day,snapshot:rows[5],plan_data:{},is_planned:false,called_out:true,callout_reason:'sick',version:1,updated_by_name:'Synthetic Admin'},
 {route_id:'r9',service_date:day,snapshot:rows[8],plan_data:{driver:'Other Driver',driverLaneId:'other'},is_planned:true,called_out:false},
 {route_id:'r10',service_date:day,snapshot:rows[9],plan_data:{driver:'Synthetic Driver',driverLaneId:'mine'},is_planned:true,called_out:false},
];

test('driver identity uses stable IDs, daily coverage and unambiguous legacy names',()=>{
 const mine={lane_profile_id:'mine'};
 assert.equal(driver.isMyTransportRoute(base,mine,day,staff),true);
 assert.equal(driver.isMyTransportRoute({...base,driverLaneId:'other'},mine,day,staff),false);
 assert.equal(driver.isMyTransportRoute(rows[6],mine,day,staff),true);
 assert.equal(driver.isMyTransportRoute(rows[7],mine,day,staff),false);
 assert.equal(driver.isMyTransportRoute(rows[7],mine,'2030-01-08',staff),true);
 assert.equal(driver.isMyTransportRoute({...base,driverLaneId:''},mine,day,staff),true);
 assert.equal(driver.isMyTransportRoute({...base,driverLaneId:''},mine,day,[...staff,{id:'duplicate',name:base.driver}]),false);
 assert.equal(driver.isMyTransportRoute(base,null,day,staff),false);
});
test('whole routes group children across locations, keep drivers distinct, and order times correctly',()=>{
 const groups=stops.groupSchoolPickupStops([rows[1],base,rows[2],rows[4]],false,route=>driver.transportDriverFor(route,day,staff));
 assert.deepEqual(groups.map(stop=>stop.pickup),['7:05 AM','12:05 PM','1:40 PM']);
 assert.deepEqual(groups[1].routes.map(route=>route.location),['Halcom','Division']);
 assert.equal(stops.groupSchoolPickupStops([base,{...base,id:99,driverLaneId:'other'}]).length,2);
 assert.equal(stops.groupSchoolPickupStops([base,rows[7]],false,route=>driver.transportDriverFor(route,day,staff)).length,2);
});

async function compile(path,deps){
 const context={exports:{},require:name=>deps[name]||(name==='@/lib/date-utils'?{localIsoDate:()=>day}:require(name))};
 vm.runInNewContext(ts.transpileModule(await readFile(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
 return context.exports.default;
}
async function screen(initial=rows){
 let cursor=0,routeRows=structuredClone(initial);const state=[],patches=[],changes=[];
 const dayStops=initial.map(route=>{const override=overrides.find(stop=>stop.snapshot.id===route.id);return {snapshot:route,service_date:day,is_planned:true,called_out:false,...override,plan_data:{pickup:route.pickup,...override?.plan_data}}});
 const react={...React,useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],value=>state[i]=typeof value==='function'?value(state[i]):value]},useRef(initial){const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i]},useMemo:fn=>fn(),useCallback:fn=>fn,useEffect(){}};
 const Groups=await compile('src/components/transportation/SchoolStopGroups.tsx',{'@/lib/school-pickup-stops':stops});
 const Callouts=await compile('src/components/transportation/TransportCallouts.tsx',{'@/lib/transport-trips':trips,'@/lib/transportation-day':daily});
 const team=await compile('src/components/transportation/TransportTeamStatus.tsx',{'@/lib/transport-driver-view':driver,'@/lib/transport-trips':trips,'@/lib/transportation-day':daily});
 const deps={'@/components/transportation/SelectedDropoffs':{default:()=>null},'@/lib/transportation-day':{...daily,transportServiceDate:()=>day},'@/lib/transport-child-schools':{transportChildKey:child=>child.legacyId||String(child.id)},react,'next/navigation':{useSearchParams:()=>new URLSearchParams()},'@/components/transportation/TransportTeamStatus':{default:team},'next/link':{default:({children,...props})=>React.createElement('a',props,children)},
  '@/components/layout/MainLayout':{default:({children})=>React.createElement('main',null,children)},
  '@/components/providers/AuthProvider':{useAuth:()=>({profile:{lane_profile_id:'mine',full_name:'Synthetic Driver',permissions:['transportation']},session:{access_token:'synthetic'},canManageSystem:false,isLocationLicensee:true})},
  '@/components/providers/LocationProvider':{useHubLocation(){throw Error('The driver route must not depend on the global location filter')}},
  '@/hooks/usePersistentState':{usePersistentState:key=>[key==='tcs-routes'?routeRows:[],update=>{routeRows=update(routeRows)},true,{error:'',retry(){}}]},
  '@/hooks/useTransportChildren':{useTransportChildren:()=>({children:rows.map(route=>({id:route.id,legacyId:route.childId,firstName:route.child,lastName:'',enrollmentStatus:'Active'})),refresh(){}})},
  '@/hooks/useTransportDay':{useTransportDay:()=>({ready:true,error:'',activeRoutes:daily.mergeTransportDay(routeRows,dayStops,day),callouts:daily.transportDayCallouts(routeRows,dayStops,day),drivers:staff,canCallOut:true,change:async(...args)=>changes.push(args),stopFor:()=>({version:1}),refresh(){}})},
  '@/lib/transport-care-handoff':handoff,'@/lib/transport-trips':trips,'@/lib/transport-driver-view':driver,'@/lib/school-pickup-stops':stops,
  '@/lib/transport-child-schools':{transportChildKey:child=>child.legacyId},'@/lib/date-utils':{localIsoDate:()=>day},
  '@/lib/emergency-cards':{emergencyCardReadiness:()=>({ready:true,missing:[]})},'@/lib/notification-client':{sendHubNotificationEvent(){}},
  '@/lib/employee-care':{starterCareLogs:[]},'@/lib/hub-data':{starterRoutes:[],starterSchools:[],starterVehicles:[]},
  '@/lib/location-config':{normalizeLocation:value=>value},'@/lib/staffing-command':{locationKeyForDbLocation:value=>value},
  '@/lib/transportation-staffing':{transportationDutyKey:(...args)=>args.join(':'),startTransportationDuty:async()=>({ok:true}),finishTransportationDuty:async()=>({ok:true})},
  '@/lib/supabase/client':{supabase:null},'@/lib/sync-events':{HUB_SYNC_EVENT:'synthetic'},
  '@/lib/transport-offline':{queueOfflineTransportAction:(...args)=>patches.push(args),readOfflineTransportActions:()=>[],clearOfflineTransportActions(){}},
  '@/components/transportation/MyAssignedRoutes':{default:()=>null},'@/components/transportation/SchoolStopGroups':{default:Groups},'@/components/transportation/TransportCallouts':{default:Callouts},
 };
 const Page=await compile('src/app/(portal)/transportation-v2/page.tsx',deps);
 const tree=()=>{cursor=0;return Page()};
 const expand=node=>Array.isArray(node)?node.flatMap(expand):node&&typeof node==='object'?typeof node.type==='function'?expand(node.type(node.props)):[node,...expand(node.props?.children)]:[];
 const text=node=>Array.isArray(node)?node.map(text).join(' '):node&&typeof node==='object'?typeof node.type==='function'?text(node.type(node.props)):text(node.props?.children):typeof node==='string'||typeof node==='number'?String(node):'';
 const render=()=>{const value=tree();return {nodes:expand(value),text:text(value),value}};
 const click=label=>{const button=render().nodes.find(node=>node.type==='button'&&text(node.props.children)===label);assert.ok(button,`button ${label}`);button.props.onClick();};
 return {render,click,patches,changes,get rows(){return routeRows}};
}
test('My Route is the default and contains every assigned location, daily reassignment and call-out',async()=>{
 const page=await screen(),view=page.render();
 for(const child of ['Synthetic Halcom Child','Synthetic 42nd Child','Synthetic Division Child','Synthetic Morning Child','Synthetic Out Sick Child','Synthetic Covering Child','Reassigned To Me Child'])assert.ok(view.text.includes(child),child);
 for(const child of ['Other Driver Child','Covered By Other Child','Reassigned Away Child'])assert.ok(!view.text.includes(child),child);
 assert.match(view.text,/No transportation — out sick/);assert.doesNotMatch(view.text,/Choose All Locations|Choose the route you are running/);
 assert.equal(view.nodes.find(node=>node.type==='button'&&node.props.children==='My Route').props['aria-pressed'],true);
 assert.equal(view.nodes.some(node=>node.type==='select'&&node.props['aria-label']==='Browse driver routes'),false);
 if(process.env.TRANSPORT_PREVIEW_DIR){await mkdir(process.env.TRANSPORT_PREVIEW_DIR,{recursive:true});await writeFile(process.env.TRANSPORT_PREVIEW_DIR+'/mine.html',require('react-dom/server').renderToStaticMarkup(view.value));}
});
test('All Routes remains available separately and selecting a driver shows their complete route',async()=>{
 const page=await screen();page.click('All Routes');let view=page.render();assert.match(view.text,/Other Driver Child/);assert.match(view.text,/Synthetic 42nd Child/);
 view.nodes.find(node=>node.type==='select'&&node.props['aria-label']==='Browse driver routes').props.onChange({target:{value:'staff:other'}});
 view=page.render();assert.match(view.text,/Other Driver Child/);assert.match(view.text,/Reassigned Away Child/);assert.doesNotMatch(view.text,/Synthetic 42nd Child|Synthetic Out Sick Child/);
 if(process.env.TRANSPORT_PREVIEW_DIR)await writeFile(process.env.TRANSPORT_PREVIEW_DIR+'/other.html',require('react-dom/server').renderToStaticMarkup(view.value));
 page.click('My Route');view=page.render();assert.match(view.text,/Synthetic 42nd Child/);assert.doesNotMatch(view.text,/Other Driver Child/);
 page.click('Afternoon · School pickups');view=page.render();assert.doesNotMatch(view.text,/Synthetic Morning Child/);assert.match(view.text,/Synthetic Halcom Child/);
 page.click('All trips');assert.match(page.render().text,/Synthetic Morning Child/);
});
test('pickup, arrival and handoff update only the selected child across locations',async()=>{
 const page=await screen();
 const article=()=>page.render().nodes.find(node=>node.type==='article'&&JSON.stringify(node.props.children).includes('Synthetic 42nd Child'));
 const buttons=node=>{const visit=node=>Array.isArray(node)?node.flatMap(visit):node&&typeof node==='object'?typeof node.type==='function'?visit(node.type(node.props)):[node,...visit(node.props?.children)]:[];return visit(node).filter(node=>node.type==='button');};
 const findButton=label=>buttons(article()).find(node=>JSON.stringify(node.props.children).includes(label));
 findButton('PICKED UP').props.onClick();assert.equal(page.rows.find(row=>row.id===2).runStatus,'Picked Up');assert.equal(page.patches[0][0],2);
 findButton('ARRIVED AT DESTINATION').props.onClick();assert.equal(page.rows.find(row=>row.id===2).runStatus,'Arrived');
 findButton('CONFIRM HANDOFF AT').props.onClick();assert.equal(page.rows.find(row=>row.id===2).runStatus,'Dropped Off');
 assert.ok(page.rows.filter(row=>row.id!==2).every(row=>!row.runStatus));
 assert.equal(page.patches.length,3);
});
test('team status distinguishes a scheduled stop, on board, arrival awaiting handoff and a finished handoff',async()=>{
 const at='2030-01-07T21:15:00Z',later='2030-01-07T21:32:00Z';
 const page=await screen([
  {...rows[0],runDate:day,runStatus:'Picked Up',pickedUpAt:at},
  {...rows[1],runDate:day,runStatus:'Arrived',pickedUpAt:at,arrivedAt:later},
  {...rows[2],runDate:day,runStatus:'Dropped Off',pickedUpAt:at,droppedOffAt:'2030-01-07T21:39:00Z'},
  {...rows[3],runDate:'2029-12-31',runStatus:'Arrived',arrivedAt:later},
 ]);
 page.click('All Routes');
 const board=page.render().nodes.find(node=>node.props.id==='transportation-status');
 const html=require('react-dom/server').renderToStaticMarkup(board);
 const full=require('react-dom/server').renderToStaticMarkup(page.render().value);
 assert.match(full,/Picked up 1:15 PM by staff/);
 assert.match(full,/Handoff completed 1:39 PM by staff/);
 if(process.env.TRANSPORT_PREVIEW_DIR)await writeFile(process.env.TRANSPORT_PREVIEW_DIR+'/status.html',require('react-dom/server').renderToStaticMarkup(page.render().value));
 for(const phrase of ['On board','Awaiting handoff','Handed off','1:15 PM','1:39 PM','Last confirmed at Division','No stop confirmed today']) assert.ok(html.includes(phrase),phrase);
});

test('an empty personal route never falls back to another driver’s children',async()=>{
 const page=await screen([rows[3]]),view=page.render();assert.match(view.text,/No trips assigned to you/);assert.doesNotMatch(view.text,/Other Driver Child/);
 page.click('Browse all routes');assert.match(page.render().text,/Other Driver Child/);
});

const apiSource=(await readFile('src/app/api/transportation-day/route.ts','utf8')).replace('"@/lib/transportation-day"',JSON.stringify(url(await readFile('src/lib/transportation-day.ts','utf8')))).replace(/import \{flushTransportAssignmentNotices\}[^;]+;/,'const flushTransportAssignmentNotices=async()=>{};').replace(/import \{requireStaff,staffErrorResponse\}[^;]+;/,'const requireStaff=async()=>globalThis.driverViewAuth;const staffErrorResponse=e=>Response.json({error:String(e)},{status:500});');
const api=await import(url(apiSource));
test('daily route data stays organization scoped and returns only public driver identifiers',async()=>{
 const calls=[];
 const userClient={from(table){const call={table,filters:[]};calls.push(call);const q={select(columns){call.columns=columns;return q},eq(...filter){call.filters.push(filter);return q},then(resolve){return Promise.resolve({data:table==='staff_lane_profiles'?[{id:'mine',full_name:'Synthetic Driver'}]:[],error:null}).then(resolve)}};return q;}};
 globalThis.driverViewAuth={isOwner:false,isLicensee:true,profile:{organization_id:'synthetic-org'},userClient};
 const response=await api.GET(new Request('https://hub.test/api/transportation-day?date='+day));assert.equal(response.status,200);
 assert.deepEqual((await response.json()).drivers,staff.slice(0,1));assert.equal(calls.length,3);
 assert.ok(calls.every(call=>call.filters.some(([key,value])=>key==='organization_id'&&value==='synthetic-org')));
 assert.equal(calls.find(call=>call.table==='staff_lane_profiles').columns,'id,full_name');
 globalThis.driverViewAuth={isOwner:false,isLicensee:false,profile:{organization_id:'synthetic-org',permissions:[]},userClient};
 assert.equal((await api.GET(new Request('https://hub.test/api/transportation-day?date='+day))).status,403);assert.equal(calls.length,3);
});
