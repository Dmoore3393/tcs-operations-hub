import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
test('deployment changes and focus events announce an update without reloading unsaved work',async()=>{
 let effect, updates=[], reloads=0;const events={};const saved=new Map([['tcs-hub-active-deployment','old-build']]);
 const source=readFileSync('src/components/pwa/PwaUpdater.tsx','utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const context={exports:{},process:{env:{}},require(name){if(name==='react')return {useEffect:fn=>{effect=fn;},useRef:()=>({current:''}),useState:()=>['',v=>updates.push(v)]};if(name==='@capacitor/core')return {Capacitor:{isNativePlatform:()=>false}};return {};},navigator:{serviceWorker:{register:async()=>({update:async()=>{}})}},sessionStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)},fetch:async()=>({ok:true,json:async()=>({gitSha:'new-build'})}),document:{visibilityState:'visible',addEventListener:(k,v)=>events[k]=v,removeEventListener(){}},window:{location:{reload:()=>reloads++},addEventListener:(k,v)=>events[k]=v,removeEventListener(){},setInterval:fn=>{events.timer=fn;return 1;},clearInterval(){}}};
 vm.runInNewContext(compiled,context);context.exports.default();const cleanup=effect();await new Promise(r=>setImmediate(r));
 events.pageshow();events.visibilitychange();events.timer();await new Promise(r=>setImmediate(r));
 assert.equal(reloads,0);assert.ok(updates.includes('new-build'));assert.equal(saved.get('tcs-hub-active-deployment'),'old-build');cleanup();
});
