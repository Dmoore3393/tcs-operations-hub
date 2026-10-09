import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/supabase/sign-out.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { signOutWithLocalRecovery } = await import("data:text/javascript;base64," + Buffer.from(outputText).toString("base64"));
const key = "sb-test-auth-token";
function storageFixture() {
  const values = new Map([[key, "session"], [key + "-user", "user"], [key + "-code-verifier", "verifier"], ["tcs-preferences", "keep"], ["sb-other-auth-token", "keep"]]);
  return { values, storage: { removeItem: (name) => values.delete(name) } };
}
function assertCleared(values) {
  assert.equal(values.has(key), false);
  assert.equal(values.has(key + "-user"), false);
  assert.equal(values.has(key + "-code-verifier"), false);
  assert.equal(values.get("tcs-preferences"), "keep");
  assert.equal(values.get("sb-other-auth-token"), "keep");
}
test("successful sign-out uses only the current session", async () => {
  const { values, storage } = storageFixture();
  await signOutWithLocalRecovery(async (options) => {
    assert.deepEqual(options, { scope: "local" });
    return { error: null };
  }, storage, key, 20);
  assertCleared(values);
});
test("a stalled Auth request cannot retain local credentials", async () => {
  const { values, storage } = storageFixture();
  await signOutWithLocalRecovery(() => new Promise(() => {}), storage, key, 10);
  assertCleared(values);
});
test("network rejection still clears the device session", async () => {
  const { values, storage } = storageFixture();
  await signOutWithLocalRecovery(async () => { throw new Error("offline"); }, storage, key, 20);
  assertCleared(values);
});
test("storage failure is reported instead of claiming sign-out succeeded", async () => {
  await assert.rejects(signOutWithLocalRecovery(async () => ({}), {
    removeItem() { throw new Error("storage unavailable"); },
  }, key, 20), /storage unavailable/);
});
