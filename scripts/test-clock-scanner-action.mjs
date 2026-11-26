import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url);
async function scan(action,staleAction,native=false){
 const tasks=[],navigations=[],effects=[];
 const deps={
  react:{...require('react'),useMemo:fn=>fn(),useCallback:fn=>fn,useRef:value=>({current:value}),useState:initial=>[initial,()=>{}],useEffect:fn=>effects.push(fn)},
  'next/navigation':{useRouter:()=>({replace:path=>navigations.push(path),push(){}}),useSearchParams:()=>new URLSearchParams({action})},
  '@/components/providers/AuthProvider':{useAuth:()=>({profile:{locations:['Halcom']},isSystemOwner:false})},
  '@/lib/native-device':{isNativeDeviceAvailable:()=>native,NativeDevice:{scanQR:async()=>({value:'https://thetcshub.com/time-clock?station=halcom'})}},
  '@/lib/location-config':{locationFromSlug:slug=>slug==='halcom'?'Halcom':null},
  '@/lib/staff-clock-stations':{locationSlugFromQr:()=> 'halcom',stationAccessAllowed:()=>true},
  jsqr:{default:()=>({data:'https://thetcshub.com/time-clock?station=halcom'})},'lucide-react':new Proxy({},{get:()=>()=>null}),
 };
 const source=readFileSync(process.env.CLOCK_SCANNER_SOURCE||'src/app/(portal)/time-clock/scan/page.tsx','utf8');
 const context={exports:{},URLSearchParams,DOMException,HTMLMediaElement:{HAVE_CURRENT_DATA:2},navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}},window:{location:{href:`https://thetcshub.com/time-clock/scan?action=${staleAction}`,search:`?action=${staleAction}`},setTimeout:fn=>{tasks.push(fn);return 1;},clearTimeout(){},cancelAnimationFrame(){},requestAnimationFrame:fn=>{fn(200);return 1;}},require:name=>deps[name]||require(name)};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
 let tree=context.exports.default();
 if(typeof tree.props?.children?.type === "function")tree=tree.props.children.type(tree.props.children.props);
 const mount=node=>{
  if(Array.isArray(node)){node.forEach(mount);return;}
  if(!node||typeof node!=='object')return;
  if(node.type==='video')node.props.ref.current={pause(){},play:async()=>{},setAttribute(){},readyState:4,videoWidth:640,videoHeight:480};
  if(node.type==='canvas')node.props.ref.current={getContext:()=>({drawImage(){},getImageData:()=>({data:[],width:640,height:480})})};
  mount(node.props?.children);
 };mount(tree);
 for(const effect of effects)effect();for(const fn of tasks)fn();await new Promise(setImmediate);
 return navigations;
}
for(const native of [false,true])test(`${native?'native':'website'} clock-out scan preserves current router action when browser history still contains clock-in`,async()=>{
 assert.deepEqual(await scan('clock_out','clock_in',native),['/time-clock?qr=1&qrLocation=halcom&qrAction=clock_out']);
});
test('clock-in scan does not reuse a previous clock-out browser address',async()=>{
 assert.deepEqual(await scan('clock_in','clock_out'),['/time-clock?qr=1&qrLocation=halcom&qrAction=clock_in']);
});
