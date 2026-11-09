import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';
const require=createRequire(import.meta.url);
const context={exports:{},require};
vm.runInNewContext(ts.transpileModule(readFileSync('src/components/scheduling/StaffWeekPlanner.tsx','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
const Planner=context.exports.default;
const flatten=node=>Array.isArray(node)?node.flatMap(flatten):node&&typeof node==='object'?[node,...flatten(node.props?.children)]:[];
test('weekly scheduler edits only the selected location and day and opens a new shift on the requested date',()=>{
 const dates=['2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-07','2026-11-08'];
 const row={id:'synthetic-shift',location_id:'synthetic-location',staff_name:'Synthetic Staff',shift_date:dates[1],start_time:'06:00:00',end_time:'14:00:00',status:'Draft',position_label:'Synthetic assignment'};
 const shifts=[row,{...row,id:'other-location',location_id:'elsewhere'},{...row,id:'cancelled',status:'Cancelled'},{...row,id:'other-week',shift_date:'2026-11-10'}];
 let added,edited;const props={dates,location:{id:'synthetic-location',name:'Synthetic Location'},shifts,saving:false,onAdd:date=>added=date,onEdit:shift=>edited=shift};
 const nodes=flatten(Planner(props));const buttons=nodes.filter(node=>node.type==='button');assert.equal(buttons.length,8);
 buttons.find(node=>node.props['aria-label']?.startsWith('Edit Synthetic Staff')).props.onClick();assert.equal(edited.id,row.id);
 buttons.filter(node=>node.props['aria-label']?.startsWith('Add staff shift'))[5].props.onClick();assert.equal(added,'2026-11-07');
 assert.ok(flatten(Planner({...props,saving:true})).filter(node=>node.type==='button').every(node=>node.props.disabled));
});

test('licensee team view shows weekend times and notes without editing controls',()=>{
 const dates=['2026-11-14','2026-11-15'];
 const row={id:'weekend',location_id:'home',staff_name:'Weekend Staff',shift_date:dates[1],start_time:'12:00:00',end_time:'18:30:00',status:'Published',position_label:'Floor',notes:'Published weekend instructions'};
 const nodes=flatten(Planner({dates,location:{id:'home',name:'Synthetic Home'},shifts:[row],readOnly:true}));
 assert.equal(nodes.filter(node=>node.type==='button').length,0);
 assert.ok(nodes.some(node=>node.props?.['aria-label']?.startsWith('Shift for Weekend Staff')));
 assert.ok(nodes.some(node=>node.props?.children==='Published weekend instructions'));
 assert.ok(nodes.some(node=>node.type==='summary'&&node.props.children==='Shift notes'));
});
