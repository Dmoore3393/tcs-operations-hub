// Run with Node >=22.13: node --experimental-vm-modules --test tests/native-report-regression.test.mjs
// Executes the actual TypeScript helpers with isolated browser/Capacitor fixtures.
// No network requests, live staff sessions, or report writes are made.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';

async function loadHelper(path, globals, dependencies) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const context = createContext({ URL, Request, Response, ...globals });
  const loadedModule = new SourceTextModule(stripTypeScriptTypes(source), { context });
  await loadedModule.link(specifier => {
    assert.ok(Object.hasOwn(dependencies, specifier), `Unexpected dependency: ${specifier}`);
    const values = dependencies[specifier];
    return new SyntheticModule(Object.keys(values), function () {
      for (const [name, value] of Object.entries(values)) this.setExport(name, value);
    }, { context });
  });
  await loadedModule.evaluate();
  return loadedModule.namespace;
}

async function nativeFixture({ native = true, href = 'capacitor://localhost/shift-reports/', server = false, failure } = {}) {
  const calls = [];
  const originalFetch = async (...args) => {
    calls.push(args);
    if (failure) throw failure;
    return new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json' } });
  };
  const window = { location: new URL(href), fetch: originalFetch };
  const api = await loadHelper('../src/lib/native-api.ts', server ? {} : { window }, {
    '@capacitor/core': { Capacitor: { isNativePlatform: () => native } },
  });
  api.ensureNativeApiTransport();
  return { api, window, calls, originalFetch };
}

test('report corrections go to the canonical production API', async () => {
  const f = await nativeFixture();
  await f.window.fetch('/api/shift-reports/type?fixture=1');
  assert.equal(String(f.calls[0][0]), 'https://thetcshub.com/api/shift-reports/type?fixture=1');
});

test('PATCH preserves bearer headers, body, and abort signal', async () => {
  const f = await nativeFixture();
  const controller = new AbortController();
  const init = { method: 'PATCH', headers: { Authorization: 'Bearer synthetic-only', 'Content-Type': 'application/json' }, body: '{"id":"fixture","type":"Closing","expectedType":"Opening"}', signal: controller.signal };
  await f.window.fetch('/api/shift-reports/type', init);
  assert.equal(f.calls[0][1], init);
  assert.equal(f.calls[0][1].body, init.body);
  assert.equal(f.calls[0][1].headers.Authorization, 'Bearer synthetic-only');
  assert.equal(f.calls[0][1].signal, controller.signal);
});

test('Request inputs preserve method, credentials, and body', async () => {
  const f = await nativeFixture();
  const request = new Request('capacitor://localhost/api/shift-reports/type', {
    method: 'PATCH', headers: { Authorization: 'Bearer synthetic-only' }, body: 'synthetic-body', credentials: 'omit',
  });
  await f.window.fetch(request);
  const forwarded = f.calls[0][0];
  assert.equal(forwarded.url, 'https://thetcshub.com/api/shift-reports/type');
  assert.equal(forwarded.method, 'PATCH');
  assert.equal(forwarded.headers.get('Authorization'), 'Bearer synthetic-only');
  assert.equal(forwarded.credentials, 'omit');
  assert.equal(await forwarded.text(), 'synthetic-body');
});

test('URL objects for staff choices use the same production origin', async () => {
  const f = await nativeFixture();
  await f.window.fetch(new URL('capacitor://localhost/api/staff-lanes?fixture=1'));
  assert.equal(String(f.calls[0][0]), 'https://thetcshub.com/api/staff-lanes?fixture=1');
});

test('Supabase RPC and unrelated external requests remain unchanged', async () => {
  const f = await nativeFixture();
  for (const url of ['https://example.supabase.co/rest/v1/rpc/create_shift_report_with_staff', 'https://example.invalid/api/test']) {
    const init = { method: 'POST', body: '{}' };
    await f.window.fetch(url, init);
    assert.equal(f.calls.at(-1)[0], url);
    assert.equal(f.calls.at(-1)[1], init);
  }
});

test('bundled pages, assets and similar non-API paths are not rewritten', async () => {
  const f = await nativeFixture();
  for (const path of ['/shift-reports/', '/_next/static/example.js', '/apiary/test', '/api']) {
    await f.window.fetch(path);
    assert.equal(f.calls.at(-1)[0], path);
  }
});

test('regular website fetch is unchanged', async () => {
  const f = await nativeFixture({ native: false, href: 'https://thetcshub.com/shift-reports/' });
  assert.equal(f.window.fetch, f.originalFetch);
});

test('unexpected native host is not redirected', async () => {
  const f = await nativeFixture({ href: 'capacitor://untrusted.invalid/shift-reports/' });
  assert.equal(f.window.fetch, f.originalFetch);
});

test('server rendering does not access window', async () => {
  const f = await nativeFixture({ server: true });
  assert.equal(f.calls.length, 0);
});

test('transport initializes once and does not duplicate requests', async () => {
  const f = await nativeFixture();
  const once = f.window.fetch;
  f.api.ensureNativeApiTransport();
  assert.equal(f.window.fetch, once);
  await f.window.fetch('/api/shift-reports/type');
  assert.equal(f.calls.length, 1);
});

test('network errors remain errors rather than becoming successful saves', async () => {
  const failure = new Error('synthetic offline');
  const f = await nativeFixture({ failure });
  await assert.rejects(f.window.fetch('/api/shift-reports/type'), error => error === failure);
});

async function reportFixture() {
  return loadHelper('../src/lib/shift-report-type.ts', {}, {
    '@/lib/employee-care': { openingChecklist: ['Shared check', 'Opening check'], closingChecklist: ['Shared check', 'Closing check'] },
  });
}
const opening = () => ({ type: 'Opening', shiftWindow: '6:00 AM–12:00 PM', checklist: { 'Shared check': true, 'Opening check': true },
  completedBy: 'Synthetic Staff', completedByStaffId: 'synthetic-id', initials: 'SS', location: 'Synthetic location', date: '2026-11-09',
  positiveBehaviors: 'Synthetic notes', pickupInformation: 'Synthetic handoff', operationsNotes: 'Preserve these notes' });

test('Opening to Closing preserves all notes, staff identity, date and location', async () => {
  const api = await reportFixture();
  const before = opening();
  const after = api.changeReportType(before, 'Closing');
  assert.equal(after.type, 'Closing');
  assert.equal(after.shiftWindow, '12:00 PM–Close');
  for (const key of Object.keys(before).filter(key => !['type','shiftWindow','checklist'].includes(key))) assert.equal(after[key], before[key]);
  assert.equal(after.checklist['Shared check'], true);
  assert.equal(after.checklist['Closing check'], false);
  assert.equal(Object.hasOwn(after.checklist, 'Opening check'), false);
});

test('Closing to Opening preserves custom shift window and notes', async () => {
  const api = await reportFixture();
  const before = { ...opening(), type: 'Closing', shiftWindow: 'Custom hours', checklist: { 'Shared check': true, 'Closing check': true } };
  const after = api.changeReportType(before, 'Opening');
  assert.equal(after.type, 'Opening');
  assert.equal(after.shiftWindow, 'Custom hours');
  assert.equal(after.operationsNotes, before.operationsNotes);
});

test('selecting the same report type preserves the original object', async () => {
  const api = await reportFixture();
  const before = opening();
  assert.equal(api.changeReportType(before, 'Opening'), before);
});

test('changing type does not mutate the original report or checklist', async () => {
  const api = await reportFixture();
  const before = opening();
  const snapshot = JSON.stringify(before);
  api.changeReportType(before, 'Closing');
  assert.equal(JSON.stringify(before), snapshot);
});
