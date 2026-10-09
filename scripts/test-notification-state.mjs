import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const source = await readFile(new URL("../src/lib/server/notification-state-store.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { loadStoredNotificationState: load, saveStoredNotificationState: save } = await import("data:text/javascript;base64," + Buffer.from(outputText).toString("base64"));
const user = { id: "test-user", app_metadata: { tcs_notification_inbox: [{ id: "legacy" }], tcs_notification_preferences: { push: false } } };
const defaults = { push: true, email: true };
function client(data, error = null) {
  return { from(table) { assert.equal(table, "user_notification_state"); return {
    select(columns) { assert.equal(columns, "inbox,preferences"); return { eq(key, id) { assert.equal(key, "user_id"); assert.equal(id, user.id); return { async maybeSingle() { return { data, error }; } }; } }; },
  }; } };
}
test("stored inbox and preferences override stale token metadata", async () => {
  assert.deepEqual(await load(client({ inbox: [{ id: "stored" }], preferences: { push: true } }), user, defaults), { inbox: [{ id: "stored" }], preferences: defaults });
});
test("an empty saved inbox never resurrects legacy notifications", async () => {
  assert.deepEqual(await load(client({ inbox: [], preferences: {} }), user, defaults), { inbox: [], preferences: defaults });
});
test("accounts without stored state retain legacy inbox during rollout", async () => {
  assert.deepEqual(await load(client(null), user, defaults), { inbox: [{ id: "legacy" }], preferences: { push: false, email: true } });
});
test("database read errors cannot silently discard notifications", async () => {
  await assert.rejects(load(client(null, { message: "read unavailable" }), user, defaults), /read unavailable/);
});
test("writes save a bounded inbox to the database without touching auth metadata", async () => {
  let writes = 0;
  const admin = { from(table) { assert.equal(table, "user_notification_state"); return { async upsert(row, options) {
    writes++; assert.equal(row.user_id, user.id); assert.equal(row.inbox.length, 100); assert.deepEqual(row.preferences, defaults);
    assert.equal(options.onConflict, "user_id"); assert.ok(Date.parse(row.updated_at)); return { error: null };
  } }; }, auth: { admin: { updateUserById() { throw new Error("JWT metadata must not be written"); } } } };
  await save(admin, user.id, Array.from({ length: 120 }, (_, i) => ({ id: String(i) })), defaults);
  assert.equal(writes, 1);
});
test("database write errors reach the caller", async () => {
  await assert.rejects(save({ from() { return { async upsert() { return { error: { message: "write unavailable" } }; } }; } }, user.id, [], defaults), /write unavailable/);
});
