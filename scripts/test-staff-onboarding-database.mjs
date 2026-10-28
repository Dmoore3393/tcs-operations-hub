import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test, before, beforeEach, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const org = id(1),
  loc = id(3),
  actor = id(10),
  employee = id(11);
before(async () => {
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table public.organizations(id uuid primary key);create table public.locations(id uuid primary key);create table public.audit_log(organization_id uuid,location_id uuid,actor_user_id uuid,action text,table_name text,row_id uuid,metadata jsonb);grant usage on schema auth to service_role;grant select on auth.users,public.organizations,public.locations to service_role;grant insert on public.audit_log to service_role;`,
  );
  const folder = new URL("../supabase/migrations/", import.meta.url);
  const files = (await readdir(folder)).filter((name) =>
    name.endsWith("_staff_onboarding.sql"),
  );
  assert.equal(files.length, 1);
  await db.exec(await readFile(new URL(files[0], folder), "utf8"));
  const grants = (await readdir(folder)).find((name) =>
    name.endsWith("_staff_onboarding_server_grants.sql"),
  );
  assert.ok(grants);
  await db.exec(await readFile(new URL(grants, folder), "utf8"));
  await db.query("insert into auth.users values($1),($2)", [actor, employee]);
  await db.query("insert into organizations values($1)", [org]);
  await db.query("insert into locations values($1)", [loc]);
});
beforeEach(async () => {
  await db.exec(
    "reset role;truncate staff_onboarding_plans,audit_log;drop trigger if exists fail_onboarding_audit on audit_log;",
  );
});
after(() => db.close());
const items = [
  { id: "synthetic-step", status: "Pending", title: "Synthetic task" },
];
async function server(fn) {
  await db.exec("set role service_role");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
async function create(
  n = 100,
  email = "synthetic@example.invalid",
  staff = employee,
) {
  return server(() =>
    db.query(
      "insert into staff_onboarding_plans(id,organization_id,location_id,staff_user_id,full_name,email,job_title,start_date,supervisor,items,created_by,updated_by) values($1,$2,$3,$4,'Synthetic Hire',$5,'Synthetic Role','2026-11-01','Synthetic Supervisor',$6,$7,$7) returning *",
      [id(n), org, loc, staff, email, JSON.stringify(items), actor],
    ),
  );
}
test("direct public/staff clients cannot read or write even a known onboarding ID", async () => {
  await create();
  for (const role of ["anon", "authenticated"]) {
    await db.exec("set role " + role);
    try {
      await assert.rejects(
        db.query("select * from staff_onboarding_plans"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("update staff_onboarding_plans set full_name='Forged'"),
        /permission denied/,
      );
    } finally {
      await db.exec("reset role");
    }
  }
  const row = (
    await db.query(
      "select relrowsecurity from pg_class where relname='staff_onboarding_plans'",
    )
  ).rows[0];
  assert.equal(row.relrowsecurity, true);
});
test("new pre-account records need no auth user and do not add accounts or staff assignments", async () => {
  const result = await create(100, "", null);
  assert.equal(result.rows[0].staff_user_id, null);
  assert.equal(
    (await db.query("select count(*)::int n from auth.users")).rows[0].n,
    2,
  );
  assert.equal(
    (await db.query("select actor_user_id,table_name from audit_log")).rows[0]
      .actor_user_id,
    actor,
  );
});
test("active records cannot duplicate a linked account or email, and archive preserves history", async () => {
  await create();
  await assert.rejects(
    create(101, "other@example.invalid"),
    /unique constraint/,
  );
  await assert.rejects(
    create(101, "SYNTHETIC@example.invalid", null),
    /unique constraint/,
  );
  await server(() =>
    db.query(
      "update staff_onboarding_plans set status='Archived' where id=$1",
      [id(100)],
    ),
  );
  await create(101, "synthetic@example.invalid", employee);
  assert.equal(
    (await db.query("select count(*)::int n from staff_onboarding_plans"))
      .rows[0].n,
    2,
  );
});
test("version-checked updates are atomic and retain the other save", async () => {
  const row = (await create()).rows[0];
  const update = () =>
    server(() =>
      db.query(
        "update staff_onboarding_plans set supervisor='Synthetic Updated',updated_by=$1 where id=$2 and updated_at=$3 returning updated_at",
        [actor, row.id, row.updated_at],
      ),
    );
  assert.equal((await update()).rows.length, 1);
  assert.equal((await update()).rows.length, 0);
  const audit = (
    await db.query(
      "select actor_user_id,metadata from audit_log order by action",
    )
  ).rows;
  assert.equal(audit.length, 2);
  assert.ok(audit.every((r) => r.actor_user_id === actor));
});
test("if audit recording fails, creation and checklist edits roll back", async () => {
  const row = (await create()).rows[0];
  await db.exec(
    "create or replace function fail_onboarding_audit() returns trigger language plpgsql as $$ begin raise exception 'Synthetic audit failure';end $$;create trigger fail_onboarding_audit before insert on audit_log for each row execute function fail_onboarding_audit();",
  );
  await assert.rejects(
    server(() =>
      db.query(
        "update staff_onboarding_plans set supervisor='Should roll back' where id=$1",
        [row.id],
      ),
    ),
    /Synthetic audit failure/,
  );
  assert.equal(
    (await db.query("select supervisor from staff_onboarding_plans")).rows[0]
      .supervisor,
    "Synthetic Supervisor",
  );
  await assert.rejects(
    create(101, "other@example.invalid", null),
    /Synthetic audit failure/,
  );
  assert.equal(
    (await db.query("select count(*)::int n from staff_onboarding_plans"))
      .rows[0].n,
    1,
  );
});
test("the server cannot permanently delete onboarding histories through its application grant", async () => {
  await create();
  await assert.rejects(
    server(() => db.query("delete from staff_onboarding_plans")),
    /permission denied/,
  );
  assert.equal(
    (await db.query("select count(*)::int n from staff_onboarding_plans"))
      .rows[0].n,
    1,
  );
});
