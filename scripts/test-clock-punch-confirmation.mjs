import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(path,deps={}) {
  const context={exports:{},require:name=>Object.hasOwn(deps,name)?deps[name]:require(name),Response,AbortController,setTimeout,clearTimeout,TypeError,SyntaxError};
  vm.runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
  return context.exports;
}
const {saveClockPunch}=load('src/lib/clock-punch.ts');
const input={event:'clock_out',source:'Location QR',location:'Halcom',pin:'4567'};
const receipt={ok:true,id:'22044',event:'clock_out',source:'Location QR',location:'Halcom',occurredAt:'2026-11-24T01:25:25.000Z',targetStaffUserId:'synthetic-staff',targetStaffName:'Synthetic Staff',performedByUserId:'synthetic-staff'};
test('only a matching persisted server receipt confirms a punch, retaining the exact server time and ID',async()=>{
  let count=0;
  const result=await saveClockPunch('synthetic-token',input,'synthetic-staff',async(url,options)=>{
    count++;assert.equal(url,'/api/time-clock');assert.equal(options.method,'POST');assert.equal(options.headers.Authorization,'Bearer synthetic-token');
    const body=JSON.parse(options.body);assert.equal(body.pin,'4567');assert.equal(body.event,'clock_out');assert.ok(body.clientTimestamp);
    return Response.json(receipt);
  });
  assert.equal(result.id,'22044');assert.equal(result.occurredAt,receipt.occurredAt);assert.equal(count,1);
});
test('HTTP 200, scan completion, and wrong or incomplete receipts never imply saved',async()=>{
  for(const patch of [{ok:false},{id:undefined},{event:'clock_in'},{targetStaffUserId:'other'},{source:'Admin Override'},{occurredAt:'invalid'},{location:''}]) {
    await assert.rejects(saveClockPunch('token',input,'synthetic-staff',async()=>Response.json({...receipt,...patch})),/did not confirm/);
  }
});
test('network ambiguity is explicit and never automatically retries a time punch',async()=>{
  let calls=0;
  await assert.rejects(saveClockPunch('token',input,'synthetic-staff',async()=>{calls++;throw new TypeError('Load failed');}),/not confirmed.*do not assume/);
  assert.equal(calls,1);
  await assert.rejects(saveClockPunch('token',input,'synthetic-staff',async()=>new Response('broken json')),/not confirmed/);
  for(const status of [403,409])await assert.rejects(saveClockPunch('token',input,'synthetic-staff',async()=>Response.json({error:'Synthetic PIN or transition error'},{status})),/Synthetic PIN or transition error/);
});
function flatten(node){if(Array.isArray(node))return node.flatMap(flatten);if(!node||typeof node!=='object')return[];return[node,...flatten(node.props?.children)];}
function text(nodes){return nodes.flatMap(n=>Array.isArray(n.props?.children)?n.props.children:[n.props?.children]).filter(v=>typeof v==='string').join(' ');}
const dialogs=load('src/components/time-clock/ClockPunchDialogs.tsx',{react:{useEffect(){},useRef(){return{current:null};}}});
test('PIN confirmation cannot submit incomplete or duplicate actions and exposes recovery when unsaved',()=>{
  let saves=0,checks=0;
  const props={action:'clock_out',location:'Halcom',pin:'4567',busy:false,ready:true,error:'',onPin(){},onConfirm(){saves++;},onCancel(){},onCheckStatus(){checks++;}};
  for(const patch of [{ready:false},{busy:true},{}]) {
    const nodes=flatten(dialogs.ConfirmClockPunch({...props,...patch}));
    assert.equal(nodes.find(n=>n.type==='input').props.type,'password');
    nodes.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
    assert.match(text(nodes),/not clocked out yet/);
  }
  assert.equal(saves,1);
  const nodes=flatten(dialogs.ConfirmClockPunch({...props,error:'Not confirmed'}));
  assert.ok(nodes.some(n=>n.props?.role==='alert'));
  nodes.find(n=>n.type==='button'&&n.props.children==='Check saved status before trying again').props.onClick();assert.equal(checks,1);
});
test('saved confirmation displays the server receipt until staff acknowledge it',()=>{
  let done=0;const nodes=flatten(dialogs.SavedClockPunch({receipt,onDone(){done++;}}));
  assert.match(text(nodes),/Clock-out saved/);assert.match(text(nodes),/22044/);assert.match(text(nodes),/5:25:25 PM/);
  assert.ok(nodes.some(n=>n.props?.role==='dialog'));assert.equal(done,0);
  nodes.find(n=>n.type==='button').props.onClick();assert.equal(done,1);
});
