import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import ts from 'typescript';
const source=(await readFile('src/lib/hub-tool-groups.ts','utf8')).replace("import {translateText} from './i18n/translate';","const translateText=value=>value;");const {groupHubTools,toolSectionOpen}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
test('every permitted tool stays reachable exactly once, with everyday tasks first and search across collapsed sections',()=>{
 const items=[{href:'/files',label:'Files'},{href:'/transportation',label:'Transportation'},{href:'/time-clock',label:'Time Clock'},{href:'/staff-schedules',label:'Staff Schedules'},{href:'/future-feature',label:'Future feature'}];const groups=groupHubTools(items);assert.equal(groups[0].title,'Everyday');assert.deepEqual(groups.flatMap(group=>group.items).map(item=>item.href).sort(),items.map(item=>item.href).sort());assert.equal(groupHubTools(items,'files')[0].items[0].href,'/files');assert.equal(groupHubTools(items,'not found').length,0);
});
test('search and the current page open the right section; other sections start collapsed',()=>{const groups=groupHubTools([{href:'/files',label:'Files'},{href:'/transportation',label:'Transportation'}]);const office=groups.find(group=>group.title==='Office & setup');assert.equal(toolSectionOpen(office,'/'),false);assert.equal(toolSectionOpen(office,'/files'),true);assert.equal(toolSectionOpen(office,'/files/detail'),true);assert.equal(toolSectionOpen(office,'/','files'),true);assert.equal(toolSectionOpen(groups[0],'/'),true);});

test('mobile tools expose inspections and maintenance under Staff & planning and search',async()=>{
 const mobile=await readFile('src/components/layout/MobileQuickActions.tsx','utf8');
 const ast=ts.createSourceFile('mobile.tsx',mobile,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const declaration=ast.statements.filter(ts.isVariableStatement).flatMap(s=>[...s.declarationList.declarations]).find(d=>d.name.getText(ast)==='toolGroups');
 assert.ok(declaration?.initializer);
 const value=declaration.initializer.getText(ast),icons=[...new Set([...value.matchAll(/icon:\s*(\w+)/g)].map(m=>m[1]))];
 const code=icons.map(name=>'const '+name+'=null;').join('\n')+'\nexport const groups='+value+';';
 const {groups}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
 const items=groups.flatMap(g=>g.items),grouped=groupHubTools(items);
 const planning=grouped.find(g=>g.title==='Staff & planning');
 for(const href of ['/pop-up-inspections','/maintenance']){
  assert.equal(planning.items.filter(i=>i.href===href).length,1);
  const item=items.find(i=>i.href===href);
  assert.ok(groupHubTools(items,item.label).flatMap(g=>g.items).some(i=>i.href===href));
 }
});
