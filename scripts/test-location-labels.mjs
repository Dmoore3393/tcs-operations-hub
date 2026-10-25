import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const moduleUrl = (text) => "data:text/javascript;base64," + Buffer.from(ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText).toString("base64");
const configUrl = moduleUrl(await source("src/lib/location-config.ts"));
const config = await import(configUrl);
const childUrl = moduleUrl((await source("src/lib/children.ts")).replace('"@/lib/location-config"', JSON.stringify(configUrl)));
const children = await import(childUrl);
const compliance = await import(moduleUrl((await source("src/lib/compliance-ops.ts")).replace('"@/lib/children"', JSON.stringify(childUrl))));
const server = await import(moduleUrl((await source("src/lib/server/location-slug.ts")).replace('import "server-only";', "").replace('"@/lib/location-config"', JSON.stringify(configUrl))));
const importSource = await source("src/app/api/children/brightwheel-import/route.ts");
const ast = ts.createSourceFile("import.ts", importSource, ts.ScriptTarget.Latest, true);
const names = new Set(["canonicalLocation", "locationSlug", "safeLocation"]);
const functions = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && names.has(node.name?.getText(ast))).map((node) => node.getText(ast)).join("\n");
const importer = await import(moduleUrl(`import { isTehachapiLocation, locationDisplayName, TEHACHAPI_LOCATION_NAME } from ${JSON.stringify(configUrl)}; import { locations as childLocationOptions } from ${JSON.stringify(childUrl)}; ${functions}; export { canonicalLocation, locationSlug, safeLocation };`));

test("D Street is offered once across child/import and compliance location lists", () => {
  assert.equal(children.locations.filter((value) => value === config.TEHACHAPI_LOCATION_NAME).length, 1);
  assert.deepEqual(compliance.programLocations, children.locations);
  assert.ok(children.locations.every((value) => !/transportation hub/i.test(value)));
  assert.equal(config.locationOptionLabel("Tehachapi"), "D Street (Tehachapi)");
});
test("D Street and legacy Tehachapi names resolve to the existing Tehachapi site", () => {
  for (const alias of ["D Street", "D-Street", "D St.", "DStreet", "D Street, Tehachapi", "Tehachapi", "Tehachapi Transportation Hub", "Thomason Family Childcare • Tehachapi", config.TEHACHAPI_LOCATION_NAME]) {
    assert.equal(config.normalizeLocation(alias), "Tehachapi", alias);
    assert.equal(server.tcsLocationSlug(alias), "tehachapi", alias);
    assert.equal(importer.canonicalLocation(alias), config.TEHACHAPI_LOCATION_NAME, alias);
    assert.equal(importer.locationSlug(alias), "tehachapi", alias);
    assert.equal(importer.safeLocation(alias), config.TEHACHAPI_LOCATION_NAME, alias);
  }
  assert.equal(config.locationSlug("Tehachapi"), "tehachapi");
});
test("a generic transportation business or ambiguous Thomason room is never guessed as a childcare site", () => {
  for (const value of ["Transportation Hub", "Thomason Transportation", "Thomason 1:1", "Unknown site"]) {
    assert.equal(importer.safeLocation(value), "", value);
    assert.equal(importer.canonicalLocation(value), "", value);
    assert.equal(server.tcsLocationSlug(value), null, value);
  }
});
test("configuration correction preserves site IDs, child/staff links and other organizations", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table organizations(id integer primary key,name text); create table locations(id integer primary key,organization_id integer references organizations,slug text,name text,full_name text,program_type text,is_active boolean,capacity integer); create table children(id integer,location_id integer references locations); create table staff_location_assignments(user_id integer,location_id integer references locations);
      insert into organizations values(1,'Thomason Childcare Solutions'),(2,'Synthetic Other Organization');
      insert into locations values(10,1,'tehachapi','Tehachapi','TCS Tehachapi','Family Childcare',true,14),(20,2,'tehachapi','Other Demo','Other Demo Site','Family Childcare',true,12);
      insert into children values(1,10); insert into staff_location_assignments values(2,10);`);
    const sql = await source("supabase/migrations/20261025235730_tehachapi_d_street_location_label.sql");
    await db.exec(sql); await db.exec(sql);
    const rows = (await db.query("select id,name,full_name,capacity from locations order by id")).rows;
    assert.deepEqual(rows, [{ id: 10, name: "D Street (Tehachapi)", full_name: config.TEHACHAPI_LOCATION_NAME, capacity: 14 }, { id: 20, name: "Other Demo", full_name: "Other Demo Site", capacity: 12 }]);
    assert.deepEqual((await db.query("select location_id from children union all select location_id from staff_location_assignments")).rows, [{ location_id: 10 }, { location_id: 10 }]);
  } finally { await db.close(); }
});
