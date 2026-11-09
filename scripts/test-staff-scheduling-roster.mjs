import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(path, dependencies = {}, globals = {}) {
  const context = { exports: {}, Response, Request, Error, ...globals, require: name => dependencies[name] ?? require(name) };
  vm.runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, context);
  return context.exports;
}
const locationConfig = load("src/lib/location-config.ts");
const people = [
  { user_id: "scheduler", full_name: "Synthetic Scheduler", role: "Owner / Admin", organization_id: "org", is_active: true, email: "private@example.test", permissions: [] },
  { user_id: "colleague", full_name: "Synthetic Colleague", role: "Employee", organization_id: "org", is_active: true, email: "private2@example.test", permissions: ["daily_care"] },
  { user_id: "other-site", full_name: "Other Site Staff", role: "Employee", organization_id: "org", is_active: true },
  { user_id: "paused", full_name: "Paused Staff", role: "Employee", organization_id: "org", is_active: false },
  { user_id: "outsider", full_name: "Other Organization", role: "Employee", organization_id: "other-org", is_active: true },
];
const sites = [
  { id: "division", name: "Division", organization_id: "org", is_active: true },
  { id: "tehachapi", name: "D Street (Tehachapi)", organization_id: "org", is_active: true },
  { id: "closed", name: "21st Street", organization_id: "org", is_active: false },
];
const assignments = [
  ...["scheduler", "colleague"].flatMap(user_id => sites.map(site => ({ organization_id: "org", user_id, location_id: site.id }))),
  { organization_id: "org", user_id: "other-site", location_id: "division" },
];

function query(rows, error = null) {
  let values = [...rows], columns;
  const builder = {
    select(value) { columns = value.split(","); return builder; },
    eq(key, value) { values = values.filter(row => row[key] === value); return builder; },
    or() { values = values.filter(row => row.is_active || row.program_type === "Maintenance Site"); return builder; },
    order(key) { values.sort((a, b) => String(a[key]).localeCompare(String(b[key]))); return builder; },
    then(resolve, reject) { return Promise.resolve({ data: columns ? values.map(row => Object.fromEntries(columns.map(key => [key, row[key]]))) : values, error }).then(resolve, reject); },
  };
  return builder;
}

function rosterHandler({ isOwner = true, isLicensee = false, locations = ["All Locations"], denied, failTable } = {}) {
  const queries = [];
  const data = { staff_access: people, locations: sites, staff_location_assignments: assignments };
  const { GET } = load("src/app/api/staff-scheduling/roster/route.ts", {
    "@/lib/location-config": locationConfig,
    "@/lib/server/require-staff": {
      requireStaff: async () => {
        if (denied) throw new Response("Unauthorized", { status: denied });
        return { isOwner, isLicensee, profile: { organization_id: "org", locations },
          userClient: { from: () => query([people[0]]) },
          admin: { from(table) { queries.push(table); return query(data[table], table === failTable ? new Error("Roster unavailable") : null); } },
        };
      },
      staffErrorResponse: error => error instanceof Response ? error : Response.json({ error: error.message }, { status: 500 }),
    },
  });
  return { get: () => GET(new Request("https://example.test/api/staff-scheduling/roster")), queries };
}

test("scheduler receives active colleagues despite self-only account reads, without private account fields", async () => {
  const response = await rosterHandler().get();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("Vary"), "Authorization");
  const { staff } = await response.json();
  assert.deepEqual(staff.map(row => row.user_id).sort(), ["colleague", "other-site", "scheduler"]);
  for (const row of staff) assert.deepEqual(Object.keys(row).sort(), ["full_name", "locations", "role", "user_id"]);
  assert.deepEqual(staff.find(row => row.user_id === "colleague").locations.sort(), ["D Street (Tehachapi)", "Division"]);
});

test("licensee roster includes colleagues covering their location and excludes locations outside their access", async () => {
  const response = await rosterHandler({ isOwner: false, isLicensee: true, locations: ["Tehachapi"] }).get();
  const { staff } = await response.json();
  assert.deepEqual(staff.map(row => row.user_id).sort(), ["colleague", "scheduler"]);
  assert.ok(staff.every(row => row.locations.length === 1 && row.locations[0] === "D Street (Tehachapi)"));
});

test("employees and unauthenticated callers cannot retrieve the scheduler roster", async () => {
  for (const settings of [{ isOwner: false, expected: 403 }, { denied: 401, expected: 401 }]) {
    const handler = rosterHandler(settings);
    assert.equal((await handler.get()).status, settings.expected);
    assert.equal(handler.queries.length, 0);
  }
});

test("a failed roster source fails explicitly instead of returning a partial or self-only list", async () => {
  for (const failTable of ["staff_access", "locations", "staff_location_assignments"]) {
    const response = await rosterHandler({ failTable }).get();
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "Roster unavailable" });
  }
});

async function schedulerScreen({ failRoster = false } = {}) {
  const state = [], effects = [], saves = [], requests = [];
  let cursor = 0;
  const react = {
    useState(initial) { const index = cursor++; if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
      return [state[index], next => { state[index] = typeof next === "function" ? next(state[index]) : next; }]; },
    useMemo: fn => fn(), useCallback: fn => fn, useEffect: fn => { effects.push(fn); },
  };
  const empty = () => null, childrenOnly = ({ children }) => children;
  const { jsx } = require("react/jsx-runtime");
  const staff = (await (await rosterHandler().get()).json()).staff;
  const lanes = [
    { id: "linked", full_name: "Synthetic Colleague", staff_user_id: "colleague", department: "Classroom", job_title: "Staff", is_active: true },
    { id: "unlinked", full_name: "Synthetic No Login", staff_user_id: null, department: "Classroom", job_title: "Staff", is_active: true },
  ];
  const profile = { user_id: "scheduler", full_name: "Synthetic Scheduler", role: "Owner / Admin", locations: ["All Locations"] };
  const dependencies = {
    react, "next/link": { default: childrenOnly }, "lucide-react": new Proxy({}, { get: () => empty }),
    "@/components/forms/ChoiceSelect": { default: empty }, "@/lib/form-options": { positionChoices: [] },
    "@/components/scheduling/StaffWeekPlanner": { default: empty }, "@/components/layout/MainLayout": { default: childrenOnly },
    "@/components/hub/HubUI": { Modal: childrenOnly, SectionCard: childrenOnly, StatCard: empty, inputClass: "input",
      PrimaryButton: props => jsx("button", props), SecondaryButton: props => jsx("button", props) },
    "@/components/providers/AuthProvider": { useAuth: () => ({ session: { access_token: "fixture" }, profile, isSystemOwner: true, isLocationLicensee: false }) },
    "@/components/providers/LocationProvider": { useHubLocation: () => ({ location: "Tehachapi", setLocation() {} }) },
    "@/hooks/usePersistentState": { usePersistentState: () => [[]] },
    "@/hooks/useDatedCarePlan": { useDatedCarePlan: () => ({ data: [] }) },
    "@/lib/weekly-care-planner": { effectiveScheduleRecords: () => [] },
    "@/lib/children": { initialChildren: [] }, "@/lib/child-schedules": { starterChildSchedules: [], compactTime: value => value },
    "@/lib/date-utils": load("src/lib/date-utils.ts"), "@/lib/location-config": locationConfig,
    "@/lib/staff-schedule-departments": load("src/lib/staff-schedule-departments.ts"),
    "@/lib/notification-client": { sendHubNotificationEvent: async () => {} },
    "@/lib/staffing-command": { buildCoverageWindows: () => [], checkedInAtLocation: () => false,
      locationKeyForDbLocation: location => locationConfig.normalizeLocation(location.name) },
    "@/lib/hub-request": { hubRequest: async (path, token) => {
      requests.push(path); assert.equal(token, "fixture");
      if (path === "/api/staff-scheduling/roster") { if (failRoster) throw new Error("Roster unavailable"); return { staff }; }
      assert.equal(path, "/api/staff-lanes"); return { lanes };
    } },
    "@/lib/supabase/client": { supabase: {
      from(table) {
        const rows = table === "locations" ? [sites[1]] : table === "staff_access" ? [people[0]] : [];
        const builder = query(rows);
        builder.gte = builder.lte = builder.in = () => builder;
        builder.insert = async payload => { saves.push({ table, payload }); return { error: null }; };
        return builder;
      },
      channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel; }, removeChannel() {},
    } },
  };
  const Page = load("src/components/scheduling/StaffingWorkspace.tsx", dependencies, {
    window: { setTimeout: (fn, delay) => { if (!delay) fn(); return 1; }, clearTimeout() {} },
  }).default;
  function flatten(node) {
    if (Array.isArray(node)) return node.flatMap(flatten);
    if (!node || typeof node !== "object") return [];
    if (typeof node.type === "function") return flatten(node.type(node.props));
    return [node, ...flatten(node.props?.children)];
  }
  function nodes() { cursor = 0; effects.length = 0; return flatten(Page({ mode: "staff" })); }
  nodes(); for (const effect of [...effects]) effect();
  await new Promise(resolve => setImmediate(resolve));
  return { nodes, saves, requests };
}

test("Assign Coverage lists linked and unlinked staff, then saves the selected colleague's account ID", async () => {
  const ui = await schedulerScreen();
  const add = ui.nodes().find(node => node.type === "button" && [node.props.children].flat().includes(" Add Shift"));
  assert.ok(add); add.props.onClick();
  const employeeSelect = () => ui.nodes().find(node => node.type === "select" && node.props.children?.flat().some(child => child?.type === "option" && child.props.children === "Choose employee…"));
  assert.ok(ui.requests.includes("/api/staff-scheduling/roster"));
  const options = ui.nodes().filter(node => node.type === "option");
  assert.ok(options.some(option => option.props.value === "colleague"));
  assert.ok(options.some(option => option.props.value === "lane:unlinked"));
  employeeSelect().props.onChange({ target: { value: "colleague" } });
  await ui.nodes().find(node => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(ui.saves.length, 1);
  assert.equal(ui.saves[0].table, "staff_shifts");
  assert.equal(ui.saves[0].payload.user_id, "colleague");
  assert.equal(ui.saves[0].payload.staff_name, "Synthetic Colleague");
  assert.equal(ui.saves[0].payload.location_id, "tehachapi");
});

test("the form shows roster loading failures and does not pretend only the scheduler is available", async () => {
  const ui = await schedulerScreen({ failRoster: true });
  assert.ok(ui.nodes().some(node => [node.props?.children].flat().includes("Roster unavailable")));
  assert.equal(ui.nodes().filter(node => node.type === "option" && node.props.value === "scheduler").length, 0);
});
