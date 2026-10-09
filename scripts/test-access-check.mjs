import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const source = await readFile(new URL("../src/lib/access-check.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { readAccessCheck } = await import("data:text/javascript;base64," + Buffer.from(outputText).toString("base64"));
const valid = (payload) => typeof payload.hasActiveAccess === "boolean";
test("valid approved and denied account responses stay distinct", async () => {
  for (const approved of [true, false]) {
    assert.deepEqual(await readAccessCheck(Response.json({ hasActiveAccess: approved }), "Parent access check", valid), { hasActiveAccess: approved });
  }
});
test("an HTML response is a transport error, not an access denial", async () => {
  await assert.rejects(readAccessCheck(new Response("<html>interrupted</html>", { status: 403, headers: { "x-vercel-id": "test-reference" } }), "Staff access check", valid), /unexpected server response.*HTTP 403; reference test-reference/);
});
test("empty JSON cannot be interpreted as an unapproved account", async () => {
  await assert.rejects(readAccessCheck(Response.json({}), "Parent access check", valid), /unexpected server response.*HTTP 200/);
});
test("explicit API errors are preserved", async () => {
  await assert.rejects(readAccessCheck(Response.json({ error: "This TCS staff account is paused." }, { status: 403 }), "Staff access check", valid), /This TCS staff account is paused/);
});
test("non-success responses cannot grant access", async () => {
  await assert.rejects(readAccessCheck(Response.json({ hasActiveAccess: true }, { status: 500 }), "Parent access check", valid), /unexpected server response.*HTTP 500/);
});
