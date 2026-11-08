import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { PGlite } from "@electric-sql/pglite";
import ts from "typescript";

const require = createRequire(import.meta.url);
const org = "00000000-0000-4000-8000-000000000001";
const site = "00000000-0000-4000-8000-000000000002";
const actor = "00000000-0000-4000-8000-000000000003";
const person = "00000000-0000-4000-8000-000000000004";
const other = "00000000-0000-4000-8000-000000000005";
const paused = "00000000-0000-4000-8000-000000000006";
const staff = [
  { id: person, full_name: "Synthetic Staff", job_title: "Teacher", primary_location: "Halcom" },
  { id: other, full_name: "Synthetic Staff", job_title: "Assistant", primary_location: "Division" },
];

async function database() {
  const db = await PGlite.create();
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$select '${actor}'::uuid$$;
    create function public.current_staff_organization_id() returns uuid language sql as $$select '${org}'::uuid$$;
    create function public.resolve_tcs_location_id(text,uuid) returns uuid language sql as $$select '${site}'::uuid where $1 = 'Halcom'$$;
    create function public.can_write_location_module(uuid,text) returns bool language sql as $$select $1 = '${site}'::uuid and $2 = 'reports'$$;
    create table staff_lane_profiles(id uuid primary key, organization_id uuid, full_name text, is_active boolean);
    insert into staff_lane_profiles values
      ('${person}','${org}','Synthetic Staff',true), ('${other}','${org}','Synthetic Staff',true),
      ('${paused}','${org}','Archived Staff',false), ('${site}','${site}','Other Organization',true);
    create table shift_reports(id uuid primary key default gen_random_uuid(), organization_id uuid, location_id uuid,
      legacy_id text, report_date date, report_type text, status text, completed_by text, staff_initials text, record_data jsonb,
      created_by uuid default auth.uid(), reviewed_by uuid, reviewed_at timestamptz, unique(organization_id,legacy_id));
    create table handoff_items(id uuid primary key default gen_random_uuid(), organization_id uuid, location_id uuid,
      legacy_id text, source_report_id uuid references shift_reports(id), handoff_date date, category text, priority text,
      completed bool, record_data jsonb, unique(organization_id,legacy_id));
    create table audit_events(data jsonb);
    create function public.record_audit_event(text,text,uuid,uuid,jsonb) returns void language sql as $$insert into public.audit_events values($5)$$;
    grant usage on schema auth to authenticated;
    grant select on staff_lane_profiles to authenticated;
    grant select, insert, update on shift_reports, handoff_items to authenticated;
    grant insert on audit_events to authenticated;
  `);
  const dir = "supabase/migrations";
  const file = (await readdir(dir)).find(path => path.endsWith("_shift_report_staff_attribution.sql"));
  await db.exec(await readFile(dir + "/" + file, "utf8"));
  await db.exec("set role authenticated");
  return db;
}

test("report saves use an active colleague, preserve their name, and create one linked handoff on retry", async t => {
  const db = await database();
  t.after(() => db.close());
  const save = (id, report) => db.query("select public.create_shift_report_with_staff($1,$2)", [id, JSON.stringify(report)]);
  const request = crypto.randomUUID(), second = crypto.randomUUID();
  const report = { type: "Closing", location: "Halcom", date: "2030-01-07", initials: "ss", status: "Submitted",
    completedByStaffId: person, completedBy: "Untrusted client label", pickupInformation: "Synthetic pickup note" };
  for (const completedByStaffId of [null, paused, site]) {
    await assert.rejects(save(request, { ...report, completedByStaffId }), /Choose a staff member/);
  }
  await assert.rejects(save(request, { ...report, initials: "123" }), /initials/);
  await assert.rejects(save(request, { ...report, location: "Unknown" }), /access/);
  await save(request, report);
  await save(request, report);
  await save(second, { ...report, type: "Opening", status: "Draft", completedByStaffId: other });
  const { rows } = await db.query("select * from shift_reports order by report_type");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].record_data.completedBy, "Synthetic Staff");
  assert.equal(rows[0].record_data.completedByStaffId, person);
  assert.equal(rows[0].created_by, actor);
  assert.equal(rows[1].record_data.completedByStaffId, other);
  const { rows: handoffs } = await db.query("select * from handoff_items");
  assert.equal(handoffs.length, 1);
  assert.equal(handoffs[0].source_report_id, rows[0].id);
  assert.equal(handoffs[0].record_data.sourceReportId, rows[0].legacy_id);
  await assert.rejects(save(request, { ...report, pickupInformation: "Different notes" }), /different version/);
  await db.query("select public.review_shift_report($1,'RD')", [rows[0].legacy_id]);
  await db.query("select public.review_shift_report($1,'XX')", [rows[0].legacy_id]);
  await db.query("select public.complete_shift_report_handoff($1,'SS')", [handoffs[0].legacy_id]);
  await db.query("select public.complete_shift_report_handoff($1,'XX')", [handoffs[0].legacy_id]);
  await db.exec("reset role; update staff_lane_profiles set full_name = 'New Name'; set role authenticated");
  await save(request, report);
  const [saved] = (await db.query("select record_data from shift_reports where id=$1", [rows[0].id])).rows;
  assert.equal(saved.record_data.completedBy, "Synthetic Staff");
  assert.equal(saved.record_data.reviewerInitials, "RD");
  assert.equal((await db.query("select record_data from handoff_items")).rows[0].record_data.completedByInitials, "SS");
  await db.exec("reset role");
  assert.equal((await db.query("select * from audit_events")).rows.length, 1);
});

async function component(path, deps) {
  const context = { exports: {}, crypto, window: { location: {}, addEventListener() {} }, require: key => deps[key] ?? require(key) };
  vm.runInNewContext(ts.transpileModule(await readFile(path, "utf8"), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, context);
  return context.exports.default;
}

async function reportScreen() {
  const state = [], calls = [], reports = [];
  let cursor = 0, rejectNext = false;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
      return [state[index], next => { state[index] = typeof next === "function" ? next(state[index]) : next; }];
    },
    useRef(initial) { return react.useState(() => ({ current: initial }))[0]; },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!state[index] || deps.some((value, i) => value !== state[index][i])) { state[index] = deps; effect(); }
    },
    useMemo: fn => fn(), useId: () => "custom-option",
  };
  const empty = () => null, childrenOnly = ({ children }) => children;
  const { jsx } = require("react/jsx-runtime");
  const button = props => jsx("button", props);
  const deps = { react, "lucide-react": new Proxy({}, { get: () => empty }),
    "@/components/layout/MainLayout": { default: childrenOnly },
    "@/components/hub/HubUI": { SectionCard: childrenOnly, StatCard: empty, DemoNotice: empty, PageIntro: empty,
      StatusBadge: childrenOnly, PrimaryButton: button, SecondaryButton: button, inputClass: "input" },
    "@/components/providers/AuthProvider": { useAuth: () => ({ session: { access_token: "fixture" } }) },
    "@/components/providers/LocationProvider": { useHubLocation: () => ({ location: "Halcom" }) },
    "@/hooks/usePersistentState": { usePersistentState: key => [key === "tcs-shift-reports-v1" ? reports : [], null, true, { retry() {} }] },
    "@/lib/date-utils": { localIsoDate: () => "2030-01-07" }, "@/lib/location-config": { careLocations: ["Halcom"] },
    "@/lib/employee-care": { openingChecklist: [], closingChecklist: [] },
    "@/lib/request-timeout": { withRequestTimeout: callback => callback(new AbortController().signal) },
    "@/lib/hub-request": { hubRequest: async (path, token) => {
      assert.equal(path, "/api/staff-lanes"); assert.equal(token, "fixture"); return { lanes: staff };
    } },
    "@/lib/supabase/client": { supabase: { rpc(name, args) {
      assert.equal(name, "create_shift_report_with_staff");
      calls.push(args);
      return { abortSignal: async () => {
        if (rejectNext) { rejectNext = false; return { error: { message: "Please retry" } }; }
        reports.push({ ...args.p_report, id: args.p_request_id }); return { error: null };
      } };
    } } },
  };
  const helperContext = { exports: {}, require: key => deps[key] };
  vm.runInNewContext(ts.transpileModule(await readFile("src/lib/shift-report-type.ts", "utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,helperContext);
  deps["@/lib/shift-report-type"] = helperContext.exports;
  deps["./ChoiceSelect"] = { default: await component("src/components/forms/ChoiceSelect.tsx", deps) };
  deps["@/components/forms/StaffNameSelect"] = { default: await component("src/components/forms/StaffNameSelect.tsx", deps) };
  const Page = await component("src/app/(portal)/shift-reports/page.tsx", deps);
  function flatten(node) {
    if (Array.isArray(node)) return node.flatMap(flatten);
    if (node == null || typeof node === "boolean") return [];
    if (typeof node !== "object") return [];
    if (typeof node.type === "function") return flatten(node.type(node.props));
    const children = flatten(node.props.children);
    return [{ type: node.type, props: node.props }, ...children];
  }
  function nodes() { cursor = 0; return flatten(Page()); }
  function find(predicate) { const node = nodes().find(predicate); assert.ok(node, "expected control"); return node; }
  const click = label => find(node => node.type === "button" && [node.props.children].flat().some(child => typeof child === "string" && child.trim() === label)).props.onClick();
  const picker = () => find(node => node.type === "select" && node.props["aria-label"] === "Completed by");
  const initials = () => find(node => node.type === "input" && node.props.required && node.props.maxLength === 4);
  nodes();
  await new Promise(resolve => setImmediate(resolve));
  return { nodes, click, picker, initials, reports, calls, failNext: () => { rejectNext = true; } };
}

test("both daily forms offer real directory choices before notes, require the selected person's initials and show the author in history", async () => {
  const ui = await reportScreen();
  assert.equal(ui.picker().props.value, "");
  const options = ui.nodes().filter(node => node.type === "option");
  assert.ok(options.some(node => node.props.value === person && node.props.children.includes("Teacher")));
  assert.ok(options.some(node => node.props.value === other && node.props.children.includes("Assistant")));
  assert.ok(ui.nodes().findIndex(node => node.type === "select" && node.props["aria-label"] === "Completed by") < ui.nodes().findIndex(node => node.type === "textarea"));
  await ui.click("Save Draft");
  assert.equal(ui.calls.length, 0);
  const choose = id => ui.picker().props.onChange({ target: { value: id } });
  const sign = value => ui.initials().props.onChange({ target: { value } });
  choose(person); sign("ss"); choose(other);
  assert.equal(ui.initials().props.value, "");
  await ui.click("Submit to Team");
  assert.equal(ui.calls.length, 0);
  sign("as"); ui.failNext(); await ui.click("Save Draft");
  assert.equal(ui.picker().props.value, other); assert.equal(ui.initials().props.value, "AS");
  await ui.click("Save Draft");
  assert.equal(ui.calls[0].p_request_id, ui.calls[1].p_request_id);
  assert.equal(ui.reports[0].type, "Opening"); assert.equal(ui.reports[0].completedByStaffId, other);
  assert.equal(ui.picker().props.value, "");
  ui.click("Closing"); choose(person); sign("ss"); await ui.click("Submit to Team");
  assert.equal(ui.reports[1].type, "Closing"); assert.equal(ui.reports[1].status, "Submitted");
  assert.equal(ui.reports[1].completedByStaffId, person); assert.equal(ui.reports[1].completedBy, "Synthetic Staff");
  ui.reports.push({ ...ui.reports[0], id: "legacy", completedBy: "Former Employee", completedByStaffId: undefined });
  ui.click("Report History");
  const authors = ui.nodes().filter(node => node.type === "span" && node.props.translate === "no");
  assert.deepEqual(authors.map(node => node.props.children.join("")).sort(), ["Former Employee (AS)", "Synthetic Staff (AS)", "Synthetic Staff (SS)"]);
});
