import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const url=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const api=await readFile(new URL('../src/lib/native-api.ts',import.meta.url),'utf8');
const {ensureNativeApiTransport}=await import(url(api.replace(/import \{ Capacitor \} from .*?;/,'const Capacitor={isNativePlatform:()=>globalThis.nativePlatform};')));
function setup(protocol='capacitor:',host='localhost'){
 const calls=[];globalThis.nativePlatform=true;globalThis.window={location:{protocol,host,href:protocol+'//'+host+'/parent/'},fetch:async(input,init)=>{calls.push({input,init});return new Response('{}')}};return calls;
}
test('native API transport preserves bearer authentication and JSON writes',async()=>{const calls=setup();ensureNativeApiTransport();await window.fetch('/api/parent/forms',{method:'POST',headers:{Authorization:'Bearer synthetic-only','Content-Type':'application/json'},body:'{"id":"demo"}'});assert.equal(String(calls[0].input),'https://tcs-operations-hub.vercel.app/api/parent/forms');assert.equal(calls[0].init.headers.Authorization,'Bearer synthetic-only');assert.equal(calls[0].init.body,'{"id":"demo"}');});
test('bundled assets and Supabase calls keep their own URLs',async()=>{const calls=setup();ensureNativeApiTransport();await window.fetch('/_next/static/example.js');await window.fetch('https://project.supabase.co/rest/v1/children');assert.equal(calls[0].input,'/_next/static/example.js');assert.equal(calls[1].input,'https://project.supabase.co/rest/v1/children');});
test('website behavior and unrelated custom origins are unchanged',async()=>{let calls=setup('https:','tcs-operations-hub.vercel.app');ensureNativeApiTransport();await window.fetch('/api/auth/profile');assert.equal(calls[0].input,'/api/auth/profile');calls=setup('capacitor:','untrusted');ensureNativeApiTransport();await window.fetch('/api/auth/profile');assert.equal(calls[0].input,'/api/auth/profile');});
test('transport is installed once and preserves Request objects',async()=>{const calls=setup();ensureNativeApiTransport();ensureNativeApiTransport();const request=new Request('capacitor://localhost/api/test?demo=1',{method:'POST',headers:{Authorization:'Bearer demo'},body:'payload'});await window.fetch(request);assert.equal(calls.length,1);assert.equal(calls[0].input.url,'https://tcs-operations-hub.vercel.app/api/test?demo=1');assert.equal(calls[0].input.headers.get('Authorization'),'Bearer demo');assert.equal(await calls[0].input.text(),'payload');});
const proxySource=(await readFile(new URL('../src/proxy.ts',import.meta.url),'utf8')).replace(/import \{ NextResponse, type NextRequest \} from .*?;/,`import {NextResponse} from '${pathToFileURL(require.resolve('next/server')).href}';`);
const {proxy,config}=await import(url(proxySource));
test('only API routes enter the native CORS boundary',()=>{assert.equal(config.matcher,'/api/:path*');});
test('approved iPhone preflight permits bearer headers and does not grant cookies',()=>{const r=proxy(new Request('https://hub.test/api/auth/profile',{method:'OPTIONS',headers:{Origin:'capacitor://localhost'}}));assert.equal(r.status,204);assert.equal(r.headers.get('Access-Control-Allow-Origin'),'capacitor://localhost');assert.match(r.headers.get('Access-Control-Allow-Headers'),/Authorization/);assert.equal(r.headers.get('Access-Control-Allow-Credentials'),null);});
test('untrusted preflights are rejected and ordinary requests do not gain CORS access',()=>{assert.equal(proxy(new Request('https://hub.test/api',{method:'OPTIONS',headers:{Origin:'https://untrusted.test'}})).status,403);const r=proxy(new Request('https://hub.test/api',{headers:{Origin:'https://untrusted.test'}}));assert.equal(r.headers.get('Access-Control-Allow-Origin'),null);});
