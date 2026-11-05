import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

const require = createRequire(import.meta.url);
const libs = new Map();
for (const name of [
  "location-config",
  "family-care-calendar",
  "child-schedules",
  "weekly-care-planner",
  "staffing-command",
]) {
  const source = await readFile(`src/lib/${name}.ts`, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const exports = {};
  new Function("require", "exports", outputText)((id) => libs.get(id) ?? require(id), exports);
  libs.set("@/lib/" + name, exports);
}
const plan = libs.get("@/lib/weekly-care-planner");
const times = libs.get("@/lib/child-schedules");
const staffing = libs.get("@/lib/staffing-command");
const org = "00000000-0000-4000-8000-000000000001";
const home = "00000000-0000-4000-8000-000000000002";
const other = "00000000-0000-4000-8000-000000000003";
const reviewer = "00000000-0000-4000-8000-000000000004";
const restricted = "00000000-0000-4000-8000-000000000005";
const monday = "2030-01-07",
  tuesday = "2030-01-08";
const child = (n) => ({
  id: `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  record_key: String(n),
  legacy_id: "legacy-" + n,
  location_id: home,
  first_name: "Sample " + n,
  last_name: "Child",
  age_group: n === 1 ? "Infant" : "School Age",
});
const block = (locationId, start, end) => ({ locationId, start, end });
const locations = [
  { id: home, name: "Halcom", slug: "halcom", full_name: "Halcom", capacity: 14 },
  { id: other, name: "33rd Street", full_name: "33rd Street", slug: "33rd-street", capacity: 14 },
];
const kids = [1, 2, 3, 4, 5].map(child);
const dated = (kid, status, blocks = []) => ({
  child_id: kid.id,
  location_id: home,
  service_date: monday,
  planner_status: status,
  care_blocks: blocks,
  no_care: status !== "scheduled",
});
const data = {
  locations,
  children: kids,
  closures: [],
  schools: [],
  overrides: [
    dated(kids[0], "scheduled", [block(home, "14:33", "15:00"), block(other, "15:00", "17:00")]),
    dated(kids[1], "scheduled", [block(home, "15:00", "15:15"), block(home, "17:00", "18:00")]),
    dated(kids[3], "no-care"),
    { ...dated(kids[4], null, null), no_care: false, start_time: "14:50:00", end_time: "15:10:00" },
  ],
};
const regular = [
  {
    childId: 1,
    childName: "Sample 1 Child",
    ageGroup: "Infant",
    defaultLocation: "Halcom",
    days: {
      Monday: {
        noCare: false,
        note: "",
        blocks: [{ id: "old", location: "Halcom", start: "07:00", end: "18:00" }],
      },
    },
  },
];

test("weekly entry distinguishes confirmed absence, unanswered schedules and older approved hours; edits affect just their dates", () => {
  const rows = plan.planForDate(data, regular, monday);
  assert.deepEqual(
    rows.map((r) => r.status),
    ["scheduled", "scheduled", "pending", "no-care", "scheduled"],
  );
  assert.equal(rows.at(-1).source, "Family approved");
  assert.equal(plan.planForDate(data, regular, "2030-01-14")[0].source, "Usual hours");
  assert.equal(plan.planForDate(data, regular, "2030-01-14")[3].status, "pending");
  assert.equal(plan.plannerPageSelection({ date: monday }).initialDate, monday);
  assert.notEqual(plan.plannerPageSelection({ date: "2030-02-30" }).initialDate, "2030-02-30");
});

test("the sheet lists every child who attends part of a window and counts only simultaneous children", () => {
  const rows = plan.planForDate(data, regular, monday);
  const peak = plan.buildDailyRatio(rows, home);
  const during = peak.windows.find((w) => w.start === 873);
  assert.equal(during.children.length, 3);
  assert.equal(during.count, 2);
  assert.deepEqual([peak.max, peak.peakStart, peak.peakEnd], [2, 890, 910]);
  assert.equal(plan.buildDailyRatio(rows, other).max, 1);
  assert.equal(plan.buildDailyRatio(rows, home, true).max, 0);
  const imported = { ...data, children: data.children.map((c) => ({ ...c, record_key: null })) };
  assert.equal(new Set(plan.effectiveScheduleRecords(imported, [], monday).map((r) => r.childId)).size, 5);
  assert.equal(times.compactTime(1440), "12 AM");
  assert.ok(plan.validatePlanBlocks([block(home, "14:00", "15:01"), block(other, "15:00", "16:00")]));
  assert.equal(plan.validatePlanBlocks([block(home, "21:00", "24:00")]), "");
});

test("staffing demand and the ratio sheet agree at handoff, after transfer, and during a closure", () => {
  const schedules = plan.effectiveScheduleRecords(data, regular, monday);
  const coverage = (location) =>
    staffing.buildCoverageWindows({ date: monday, location, schedules, shifts: [], activities: [], rules: [] });
  assert.equal(Math.max(...coverage(locations[0]).map((w) => w.childCount)), 2);
  assert.deepEqual(
    coverage(locations[0])
      .find((w) => w.start === 900)
      .children.map((r) => String(r.childId)),
    ["2", "5"],
  );
  assert.deepEqual(
    coverage(locations[1]).map((w) => w.childCount),
    [1],
  );
  const closed = { ...data, closures: [{ location_id: home, closure_date: monday }] };
  const result = plan.effectiveScheduleRecords(closed, regular, monday);
  assert.equal(
    result.some((r) => r.days.Monday.blocks.some((b) => b.location === "Halcom")),
    false,
  );
  assert.equal(result[0].days.Monday.blocks[0].location, "33rd Street");
});

test("dated saves are atomic, authorized for all sites, versioned, safe to retry and scoped to one week", async (t) => {
  const db = await PGlite.create();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create publication supabase_realtime;
    create table organizations(id uuid primary key);
    create table locations(id uuid primary key,organization_id uuid);
    create table children(id uuid primary key,organization_id uuid,location_id uuid,legacy_id text,enrollment_status text);
    create table care_calendar_closures(organization_id uuid,location_id uuid,closure_date date);
    create table child_schedule_overrides(organization_id uuid,location_id uuid,child_id uuid,child_legacy_id text,service_date date,no_care boolean,start_time time,end_time time,note text,source_submission_id uuid,approved_by uuid,approved_at timestamptz,updated_at timestamptz default now(),unique(organization_id,child_id,service_date),check(no_care or (start_time is not null and end_time is not null and end_time>start_time)));
    create function stamp() returns trigger language plpgsql as $$begin new.updated_at=clock_timestamp(); return new; end$$;
    create trigger stamp before update on child_schedule_overrides for each row execute function stamp();
    create function can_read_location_module(uuid,text) returns boolean language sql as $$select $1='${home}'::uuid$$;
    create function current_staff_organization_id() returns uuid language sql as $$select '${org}'::uuid$$;
    create function authorized_care_reviewer(uuid,uuid,uuid) returns boolean language sql as $$select $2='${org}'::uuid and (($1='${reviewer}'::uuid and $3 in ('${home}'::uuid,'${other}'::uuid)) or ($1='${restricted}'::uuid and $3='${home}'::uuid))$$;
    insert into organizations values('${org}'); insert into locations values('${home}','${org}'),('${other}','${org}');
    insert into children values('${kids[0].id}','${org}','${home}','legacy-1','Active');
    insert into care_calendar_closures values('${org}','${other}','${tuesday}');
    alter table child_schedule_overrides enable row level security;
    grant select on child_schedule_overrides to authenticated;
    create policy base_read on child_schedule_overrides for select to authenticated using (can_read_location_module(location_id,'schedules'));
  `);
  await db.exec(`
    alter table locations add column name text, add column slug text, add column is_active boolean default true;
    update locations set name=case when id='${home}' then 'Halcom' else '33rd Street' end, slug=case when id='${home}' then 'halcom' else '33rd-street' end;
    alter table children add column record_data jsonb default '{}', add column first_name text default 'Sample', add column last_name text default 'Child', add column age_group text default 'Infant';
    create table child_schedules(id uuid primary key default gen_random_uuid(),organization_id uuid,location_id uuid,child_id uuid,
      legacy_id text,child_name text,age_group text,is_primary boolean,weekly_schedule jsonb,record_data jsonb,updated_by uuid,updated_at timestamptz default now(),unique(organization_id,legacy_id));
    insert into child_schedules(organization_id,location_id,legacy_id,record_data) values('${org}','${home}','unrelated-boundary','{}');
  `);
  const hardening = await readFile("supabase/production-hardening.sql", "utf8");
  for (const name of ["tcs_location_slug", "tcs_schedule_location_slugs", "tcs_schedule_for_location"]) {
    const start = hardening.indexOf("create or replace function public." + name + "(");
    await db.exec(hardening.slice(start, hardening.indexOf("$$;", hardening.indexOf("as $$", start)) + 3));
  }
  const migration = (await readdir("supabase/migrations")).find((n) =>
    n.endsWith("_weekly_child_schedule_planner.sql"),
  );
  await db.exec(await readFile("supabase/migrations/" + migration, "utf8"));
  const both = [block(home, "07:00", "08:00"), block(other, "15:00", "18:00")];
  const save = (actor, dates, blocks = both, status = "scheduled") =>
    db.query("select save_child_planner_days($1,$2,$3,$4,$5,$6,'')", [
      org,
      actor,
      kids[0].id,
      JSON.stringify(dates),
      status,
      JSON.stringify(blocks),
    ]);
  const days = [
    { date: monday, version: null },
    { date: tuesday, version: null },
  ];
  await assert.rejects(save(reviewer, days), /closed/);
  await assert.rejects(save(restricted, [days[0]]), /assigned active location/);
  await assert.rejects(save(reviewer, [days[0], { date: "2030-01-14", version: null }]), /single week/);
  assert.equal((await db.query("select * from child_schedule_overrides")).rows.length, 0);
  await save(reviewer, [days[0]]);
  await save(reviewer, [days[0]]);
  await assert.rejects(save(reviewer, [days[0]], [], "no-care"), /has changed/);
  await assert.rejects(save(restricted, [days[0]], [], "pending"), /cannot change/);
  await db.exec("set role authenticated");
  assert.equal((await db.query("select * from child_schedule_overrides")).rows.length, 0);
  await assert.rejects(save(reviewer, [days[0]]), /permission denied/);
  await db.exec("reset role");
  await assert.rejects(
    db.query("update child_schedule_overrides set planner_status=null,care_blocks=null,approved_by=$1", [
      restricted,
    ]),
    /outside your assigned sites/,
  );
  const {
    rows: [{ version }],
  } = await db.query("select updated_at::text as version from child_schedule_overrides");
  await save(reviewer, [{ date: monday, version }, days[1]], [], "no-care");
  const templateDays = times.emptyWeek();
  templateDays.Monday = {
    noCare: false,
    note: "School in between",
    blocks: [
      { id: "am", location: "Halcom", start: "07:00", end: "08:00" },
      { id: "pm", location: "33rd Street", start: "15:00", end: "18:00" },
    ],
  };
  const saveTemplate = (actor, version, days) =>
    db.query("select save_child_planner_template($1,$2,$3,$4,$5)", [
      org,
      actor,
      kids[0].id,
      JSON.stringify(days),
      version,
    ]);
  await assert.rejects(saveTemplate(restricted, null, templateDays), /assigned site/);
  await saveTemplate(reviewer, null, templateDays);
  assert.equal(
    (await db.query("select count(*)::int as n from child_schedules where child_id=$1", [kids[0].id])).rows[0]
      .n,
    2,
  );
  assert.equal(
    (await db.query("select record_data->>'childId' as k from child_schedules where is_primary")).rows[0].k,
    "legacy-1",
  );
  await assert.rejects(saveTemplate(reviewer, null, templateDays), /hours have changed/);
  const templateVersion = (
    await db.query("select max(updated_at)::text as stamp from child_schedules where child_id=$1", [kids[0].id])
  ).rows[0].stamp;
  await saveTemplate(reviewer, templateVersion, times.emptyWeek());
  assert.equal((await db.query("select count(*)::int as n from child_schedules")).rows[0].n, 2);
  assert.equal((await db.query("select count(*)::int as n from child_schedule_overrides")).rows[0].n, 2);
  assert.deepEqual(
    (await db.query("select no_care,planner_status from child_schedule_overrides order by service_date")).rows,
    [
      { no_care: true, planner_status: "no-care" },
      { no_care: true, planner_status: "no-care" },
    ],
  );
});
