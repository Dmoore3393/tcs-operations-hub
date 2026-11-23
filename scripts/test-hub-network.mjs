import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
function fixture(fetch) {
  const context = { exports: {}, TypeError, Error, fetch, require: () => ({ withRequestTimeout: operation => operation(new AbortController().signal) }) };
  vm.runInNewContext(ts.transpileModule(readFileSync('src/lib/hub-request.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.exports.hubRequest;
}
test('a transient failed schedule read retries with the same authorization and no cache', async () => {
  let calls = 0;
  const request = fixture(async (url, init) => {
    assert.equal(url, '/api/staff-scheduling/team');
    assert.equal(init.headers.Authorization, 'Bearer synthetic');
    assert.equal(init.cache, 'no-store');
    if (++calls === 1) throw new TypeError('Load failed');
    return new Response(JSON.stringify({ shifts: ['published'] }));
  });
  assert.equal(JSON.stringify(await request('/api/staff-scheduling/team', 'synthetic')), JSON.stringify({ shifts: ['published'] }));
  assert.equal(calls, 2);
});
test('persistent network failure has a useful error after one retry', async () => {
  let calls = 0;
  const request = fixture(async () => { calls++; throw new TypeError('FetchEvent.respondWith received an error'); });
  await assert.rejects(request('/api/staff-scheduling/team', 'synthetic'), /Check your connection/);
  assert.equal(calls, 2);
});
test('writes are never automatically retried', async () => {
  let calls = 0;
  const request = fixture(async () => { calls++; throw new TypeError('Load failed'); });
  await assert.rejects(request('/api/staff-scheduling/publish', 'synthetic', { method: 'POST', body: '{}' }));
  assert.equal(calls, 1);
});
test('permission denial is preserved without retry', async () => {
  let calls = 0;
  const request = fixture(async () => { calls++; return new Response(JSON.stringify({error:'Location access denied'}), {status:403}); });
  await assert.rejects(request('/api/staff-scheduling/team', 'synthetic'), /Location access denied/);
  assert.equal(calls, 1);
});
test('installed app leaves private network traffic with browser while retaining push', () => {
  const handlers = new Map();
  vm.runInNewContext(readFileSync('public/sw.js', 'utf8'), { self: { addEventListener: (event, handler) => handlers.set(event, handler) } });
  assert.equal(handlers.has('fetch'), false);
  assert.equal(handlers.has('push'), true);
  assert.equal(handlers.has('notificationclick'), true);
});
function loadModule(path, deps = {}, globals = {}) {
  const context = {exports:{},Response,JSON,Error,AbortController,setTimeout,clearTimeout,...globals,require:name=>deps[name]};
  vm.runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
  return context.exports;
}
const {withRequestTimeout} = loadModule('src/lib/request-timeout.ts');
const accessCheck = loadModule('src/lib/access-check.ts');
function profileFixture(fetch, timeout=withRequestTimeout) {
  return loadModule('src/lib/staff-profile-request.ts', {'@/lib/request-timeout':{withRequestTimeout:timeout},'@/lib/access-check':accessCheck},{fetch}).requestStaffProfile;
}
test('staff verification allows cold starts but still validates the server profile', async () => {
  let deadline;
  const request = profileFixture(async (_url, init) => {
    assert.equal(init.headers.Authorization,'Bearer synthetic');
    assert.equal(init.cache,'no-store');
    return new Response(JSON.stringify({profile:{user_id:'synthetic',role:'Employee'}}));
  }, (operation, milliseconds) => { deadline=milliseconds; return withRequestTimeout(operation, milliseconds); });
  const result=await request('synthetic');
  assert.equal(deadline,30000);
  assert.equal(result.profile.user_id,'synthetic');
  assert.equal(result.profile.role,'Employee');
});
test('staff verification aborts a stalled response body instead of loading forever', async () => {
  let signal;
  const request=profileFixture(async (_url,init) => {signal=init.signal;return {status:200,ok:true,headers:new Headers(),text:()=>new Promise(()=>{})};});
  await assert.rejects(request('synthetic',20),/taking too long/);
  assert.equal(signal.aborted,true);
});
test('staff verification rejects paused accounts and malformed profiles', async () => {
  for (const [body,status,message] of [[{error:'This TCS staff account is paused.'},403,/paused/],[{profile:{role:'Owner / Admin'}},200,/unexpected server response/]]) {
    const request=profileFixture(async()=>new Response(JSON.stringify(body),{status}));
    await assert.rejects(request('synthetic'),message);
  }
});
