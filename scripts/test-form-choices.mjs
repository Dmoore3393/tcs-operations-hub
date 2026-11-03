import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const require=createRequire(import.meta.url),React=require('react');
const render=component=>require('react-dom/server').renderToStaticMarkup(component);
async function load(path,deps={}) {
 const context={exports:{},require:name=>deps[name]||require(name)};
 vm.runInNewContext(ts.transpileModule(await readFile(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
 return context.exports.default;
}
const Choice=await load('src/components/forms/ChoiceSelect.tsx',{'@/components/hub/HubUI':{inputClass:'input'}});
test('opening a dropdown keeps an existing unlisted value and never edits the record',()=>{
 let edits=0;
 const html=render(React.createElement(Choice,{label:'Destination',value:'Synthetic custom home',options:['Division','Division','Halcom'],onChange:()=>edits++}));
 assert.match(html,/<option value="Synthetic custom home" selected="">Synthetic custom home<\/option>/);
 assert.equal((html.match(/value="Division"/g)||[]).length,1);
 assert.equal(edits,0);assert.doesNotMatch(html,/Other — enter/);
 assert.match(html,/aria-label="Destination"/);assert.match(html,/min-height:44px;font-size:16px/);
});
test('an optional field stays blank until a person chooses a value',()=>{
 const html=render(React.createElement(Choice,{label:'School',value:'',options:['Synthetic School'],onChange(){}}));
 assert.match(html,/<option value="" selected="">/);assert.doesNotMatch(html,/required/);
});
test('custom entry retains the old value until edited and still supports required and disabled fields',async()=>{
 let custom=false,value='Existing home';const changes=[];
 const component=await load('src/components/forms/ChoiceSelect.tsx',{react:{useId:()=>':synthetic-custom:',useState:()=>[custom,next=>custom=next]},'@/components/hub/HubUI':{inputClass:'input'}});
 const draw=()=>component({label:'Destination',value,options:['Division'],required:true,allowCustom:true,onChange:next=>{value=next;changes.push(next)}});
 let tree=draw();let select=tree.props.children[0];select.props.onChange({target:{value:':synthetic-custom:'}});
 assert.equal(value,'Existing home');assert.deepEqual(changes,[]);
 tree=draw();let input=tree.props.children[1];assert.equal(input.type,'input');assert.equal(input.props.required,true);
 input.props.onChange({target:{value:'New home'}});assert.equal(value,'New home');
 tree=draw();tree.props.children[0].props.onChange({target:{value:'Division'}});assert.equal(value,'Division');assert.equal(custom,false);
 const disabled=component({label:'Owner',value:'Synthetic Staff',options:[],disabled:true,onChange(){}});assert.equal(disabled.props.children[0].props.disabled,true);
});
test('school and vehicle choices use the existing live collections and retain historical assignments',async()=>{
 const sources={
  'tcs-schools-v2':[{school:'Synthetic Active',status:'Active'},{school:'Synthetic Closed',status:'Inactive'}],
  'tcs-vehicles-v2':[{name:'Synthetic Ready',status:'Ready'},{name:'Synthetic Repair',status:'Out of Service'}],
 };
 const deps={'@/components/forms/ChoiceSelect':{default:Choice},'./ChoiceSelect':{default:Choice},'@/hooks/usePersistentState':{usePersistentState:key=>{assert.ok(key in sources);return[sources[key],()=>{},true,{retry(){}}]}},'@/lib/hub-data':{starterSchools:[],starterVehicles:[]}};
 const School=await load('src/components/forms/SchoolNameSelect.tsx',deps),Vehicle=await load('src/components/forms/VehicleNameSelect.tsx',deps);
 assert.doesNotMatch(render(React.createElement(School,{value:'',onChange(){}})),/Synthetic Closed/);
 assert.match(render(React.createElement(School,{value:'Synthetic Closed',onChange(){}})),/value="Synthetic Closed" selected/);
 assert.doesNotMatch(render(React.createElement(Vehicle,{value:'',onChange(){}})),/Synthetic Repair/);
 assert.match(render(React.createElement(Vehicle,{value:'',forMaintenance:true,onChange(){}})),/Synthetic Repair/);
});
