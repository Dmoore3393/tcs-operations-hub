import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/lib/request-timeout.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { withRequestTimeout } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
test('a stalled connection times out even when the operation ignores abort', async () => {
  let signal;
  await assert.rejects(withRequestTimeout(s => { signal = s; return new Promise(() => {}); }, 20), /taking too long/);
  assert.equal(signal.aborted, true);
});
test('a successful read returns its data and removes the timeout', async () => {
  let signal;
  assert.deepEqual(await withRequestTimeout(async s => { signal = s; return { rows: [1] }; }, 20), { rows: [1] });
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(signal.aborted, false);
});
test('read failures propagate so the UI can show retry', async () => {
  await assert.rejects(withRequestTimeout(async () => { throw new Error('offline'); }, 20), /offline/);
});
