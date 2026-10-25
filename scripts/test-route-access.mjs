import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const moduleUrl = (source) => "data:text/javascript;base64," + Buffer.from(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText).toString("base64");
const routes = moduleUrl(await readFile(new URL("../src/lib/route-pathname.ts", import.meta.url), "utf8"));
const team = moduleUrl(await readFile(new URL("../src/lib/team-access.ts", import.meta.url), "utf8"));
const source = await readFile(new URL("../src/components/providers/AuthProvider.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("AuthProvider.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set(["canAccessRoute", "isAssignedTimesheetStaff", "isOwnerRole", "isLicenseeRole", "isEmployeeRole"]);
const policy = ast.statements.filter((node) =>
  ts.isFunctionDeclaration(node) && names.has(node.name?.text)
  || ts.isVariableStatement(node) && node.declarationList.declarations.some((item) => item.name.getText(ast) === "ownerOnlyRoutes")
).map((node) => node.getText(ast)).join("\n");
const { canAccessRoute } = await import(moduleUrl(`
  import { normalizeHubPathname } from ${JSON.stringify(routes)};
  import { isOwnerAccessRole, isLicenseeAccessRole, isEmployeeAccessRole, employeeCanAccessRoute } from ${JSON.stringify(team)};
  ${policy}
`));
const { normalizeHubPathname } = await import(routes);

test("packaged sign-in and parent view paths use the same route identity as the website", () => {
  for (const route of ["/login", "/parent-login", "/account", "/accept-invite", "/parent/care", "/parent/forms"]) {
    assert.equal(normalizeHubPathname(route + "/"), route);
  }
  assert.equal(normalizeHubPathname("/"), "/");
});

test("trailing slashes cannot bypass owner-only restrictions for a location licensee", () => {
  const profile = { role: "Location Licensee", full_name: "Synthetic Reviewer", permissions: [] };
  for (const route of ["/settings", "/team-access", "/locations", "/payroll-ops", "/account-deletion-requests"]) {
    assert.equal(canAccessRoute(profile, route), false, route);
    assert.equal(canAccessRoute(profile, route + "/"), false, route + "/");
  }
  assert.equal(canAccessRoute(profile, "/meals/"), true);
});

test("employee permissions remain required for native routes", () => {
  const profile = { role: "Employee", full_name: "Synthetic Employee", permissions: ["meals"] };
  assert.equal(canAccessRoute(profile, "/meals"), true);
  assert.equal(canAccessRoute(profile, "/meals/"), true);
  assert.equal(canAccessRoute(profile, "/team-access/"), false);
  assert.equal(canAccessRoute({ ...profile, permissions: [] }, "/meals/"), false);
});

test("normalization never grants an unauthenticated profile access", () => {
  for (const route of ["/", "/meals/", "/settings/", "/account-deletion-requests/"]) {
    assert.equal(canAccessRoute(null, route), false);
  }
});
