import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const read = (p) => readFile(new URL("../" + p, import.meta.url), "utf8");
const url = (source) =>
  "data:text/javascript;base64," +
  Buffer.from(
    ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
      },
    }).outputText,
  ).toString("base64");
const helperUrl = url(await read("src/lib/staff-onboarding.ts"));
const helper = await import(helperUrl);
const actor = "00000000-0000-4000-8000-000000000010",
  employee = "00000000-0000-4000-8000-000000000011",
  org = "00000000-0000-4000-8000-000000000001",
  location = "00000000-0000-4000-8000-000000000003",
  otherLocation = "00000000-0000-4000-8000-000000000004",
  planId = "00000000-0000-4000-8000-000000000100";
const now = "2026-10-28T10:00:00.000Z";
const plan = () => ({
  id: planId,
  organization_id: org,
  location_id: location,
  staff_user_id: employee,
  full_name: "Synthetic New Hire",
  job_title: "Synthetic Teacher",
  start_date: "2026-11-01",
  supervisor: "Synthetic Supervisor",
  email: "synthetic@example.invalid",
  items: helper.newOnboardingItems("2026-11-01", "Synthetic Supervisor"),
  status: "Active",
  updated_at: now,
});
test("new hires get 22 dated steps from pre-start through 30/60/90 without creating accounts", () => {
  const items = helper.newOnboardingItems("2026-11-01", "Synthetic Supervisor");
  assert.equal(items.length, 22);
  assert.equal(new Set(items.map((i) => i.id)).size, 22);
  assert.equal(items[0].dueDate, "2026-10-31");
  assert.equal(items.at(-1).dueDate, "2027-01-30");
  assert.ok(items.every((i) => i.status === "Pending" && !i.verifiedAt));
  assert.equal(helper.dateAfter("2026-03-07", 7), "2026-03-14");
  assert.throws(
    () => helper.newOnboardingItems("2026-02-31", "Demo"),
    /valid start date/,
  );
});
test("employee submissions cannot impersonate verifiers, change owners/dates or waive steps", () => {
  const item = plan().items[0];
  const changed = helper.updateOnboardingItem(
    item,
    {
      status: "Submitted",
      owner: "Forged",
      dueDate: "2000-01-01",
      verifiedBy: "Forged",
    },
    false,
    "Synthetic Employee",
    now,
  );
  assert.equal(changed.owner, item.owner);
  assert.equal(changed.dueDate, item.dueDate);
  assert.equal(changed.verifiedBy, "");
  assert.equal(changed.submittedBy, "Synthetic Employee");
  for (const status of ["Verified", "Not applicable"])
    assert.throws(
      () =>
        helper.updateOnboardingItem(
          item,
          { status },
          false,
          "Synthetic Employee",
          now,
        ),
      /Only leadership/,
    );
});
test("verification requires unexpired proof; non-applicable items require a reason; reopening removes verification", () => {
  const item = plan().items[0];
  assert.throws(
    () =>
      helper.updateOnboardingItem(
        item,
        { status: "Verified", expiresOn: "2020-01-01" },
        true,
        "Synthetic Manager",
        now,
      ),
    /expired/,
  );
  assert.throws(
    () =>
      helper.updateOnboardingItem(
        item,
        { status: "Not applicable" },
        true,
        "Synthetic Manager",
        now,
      ),
    /Explain/,
  );
  const verified = helper.updateOnboardingItem(
    item,
    { status: "Verified", expiresOn: "2027-01-01", verifiedBy: "Forged" },
    true,
    "Synthetic Manager",
    now,
  );
  assert.equal(verified.verifiedBy, "Synthetic Manager");
  assert.throws(
    () =>
      helper.updateOnboardingItem(
        verified,
        { status: "Submitted" },
        false,
        "Employee",
        now,
      ),
    /reopen/,
  );
  assert.equal(
    helper.updateOnboardingItem(
      verified,
      { status: "Pending" },
      true,
      "Manager",
      now,
    ).verifiedBy,
    "",
  );
  assert.equal(
    helper.onboardingSummary([verified], "2027-01-02").readyForReview,
    false,
  );
});
let scenario = 0;
async function api(options = {}) {
  const calls = [];
  const record = options.plan || plan();
  const manager = !options.employee;
  const auth = {
    user: { id: options.employee ? employee : actor },
    profile: { organization_id: org, full_name: "Synthetic Actor" },
    isOwner: !options.employee && !options.licensee,
    isLicensee: !!options.licensee,
  };
  const admin = {
    from(table) {
      let action = "read",
        payload,
        filters = [];
      const q = {
        select() {
          return q;
        },
        eq(...args) {
          filters.push(args);
          calls.push(["eq", table, ...args]);
          return q;
        },
        in(...args) {
          filters.push(args);
          calls.push(["in", table, ...args]);
          return q;
        },
        order() {
          return q;
        },
        range() {
          return q;
        },
        insert(data) {
          action = "insert";
          payload = data;
          return q;
        },
        update(data) {
          action = "update";
          payload = data;
          return q;
        },
        async maybeSingle() {
          return result(true);
        },
        async single() {
          return result(true);
        },
        then(resolve, reject) {
          return Promise.resolve(result(false)).then(resolve, reject);
        },
      };
      function result(single) {
        if (action !== "read") {
          calls.push([action, table, payload]);
          return {
            data: options.conflict ? null : { id: planId },
            error: null,
          };
        }
        if (table === "locations")
          return {
            data: [
              {
                id: location,
                name: "Synthetic Location",
                full_name: "Synthetic TCS Location",
              },
            ],
            error: null,
          };
        if (table === "staff_location_assignments")
          return {
            data: single
              ? { user_id: employee }
              : [{ user_id: employee, location_id: location }],
            error: null,
          };
        if (table === "staff_access")
          return {
            data: single
              ? options.badLink
                ? null
                : { user_id: employee, full_name: "Synthetic Employee" }
              : [{ user_id: employee, full_name: "Synthetic Employee" }],
            error: null,
          };
        if (table === "staff_onboarding_plans") {
          if (
            single &&
            filters.some(([key, value]) => key === "id" && value !== planId)
          )
            return { data: null, error: null };
          if (
            single &&
            filters.some(
              ([key, value]) =>
                key === "staff_user_id" && value !== record.staff_user_id,
            )
          )
            return { data: null, error: null };
          if (single && options.noPlan) return { data: null, error: null };
          return { data: single ? record : [record], error: null };
        }
        throw Error("Unexpected table " + table);
      }
      return q;
    },
  };
  globalThis.__onboardingAuth = async () => {
    if (options.anonymous) throw new Response("Sign in", { status: 401 });
    return { ...auth, admin };
  };
  let source = await read("src/app/api/staff-onboarding/route.ts");
  source = source
    .replace(
      /import \{ requireStaff, staffErrorResponse \} from .*?;/,
      "const requireStaff=globalThis.__onboardingAuth;const staffErrorResponse=e=>e instanceof Response?e:Response.json({error:String(e)},{status:500});",
    )
    .replace('"@/lib/staff-onboarding"', JSON.stringify(helperUrl));
  const route = await import(url(source + "\n// scenario " + scenario++));
  const request = (method, body = {}, query = "") =>
    route[method](
      new Request("https://synthetic.invalid/api/staff-onboarding" + query, {
        method,
        ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
      }),
    );
  return { request, calls, manager };
}
const patch = (extra = {}) => ({
  id: planId,
  expectedUpdatedAt: now,
  action: "item",
  itemId: "step-1",
  item: { status: "Submitted" },
  ...extra,
});
test("anonymous requests and employee creation never reach onboarding data", async () => {
  let t = await api({ anonymous: true });
  assert.equal((await t.request("GET")).status, 401);
  assert.equal(t.calls.length, 0);
  t = await api({ employee: true });
  assert.equal((await t.request("POST", { fullName: "Forged" })).status, 403);
  assert.equal(t.calls.length, 0);
});
test("employee reads are scoped to their own linked account and never list coworkers", async () => {
  const t = await api({ employee: true });
  const result = await (await t.request("GET")).json();
  assert.equal(result.canManage, false);
  assert.deepEqual(result.staff, []);
  assert.ok(
    t.calls.some(
      (c) =>
        c[0] === "eq" &&
        c[1] === "staff_onboarding_plans" &&
        c[2] === "staff_user_id" &&
        c[3] === employee,
    ),
  );
  const unlinked = await api({
    employee: true,
    plan: { ...plan(), staff_user_id: actor },
  });
  assert.equal((await unlinked.request("PATCH", patch())).status, 404);
  assert.ok(!unlinked.calls.some((c) => c[0] === "update"));
});
test("licensees see only assigned locations and cannot update a foreign-site record", async () => {
  const t = await api({ licensee: true });
  await t.request("GET");
  assert.ok(
    t.calls.some(
      (c) =>
        c[0] === "in" &&
        c[1] === "staff_onboarding_plans" &&
        c[2] === "location_id" &&
        c[3][0] === location,
    ),
  );
  const foreign = await api({
    licensee: true,
    plan: { ...plan(), location_id: otherLocation },
  });
  assert.equal((await foreign.request("PATCH", patch())).status, 403);
  assert.ok(!foreign.calls.some((c) => c[0] === "update"));
});
test("staff may submit but only leadership can verify, archive, link or complete review", async () => {
  const employeeCase = await api({ employee: true });
  assert.equal((await employeeCase.request("PATCH", patch())).status, 200);
  assert.equal(
    employeeCase.calls.find((c) => c[0] === "update")[2].items[0].submittedBy,
    "Synthetic Actor",
  );
  for (const body of [
    patch({ item: { status: "Verified" } }),
    patch({ action: "archive" }),
    patch({ action: "link", staffUserId: actor }),
    patch({ action: "review" }),
  ]) {
    const t = await api({ employee: true });
    assert.ok([400, 403].includes((await t.request("PATCH", body)).status));
    assert.ok(!t.calls.some((c) => c[0] === "update"));
  }
});
test("stale versions and concurrent saves preserve the newer checklist", async () => {
  let t = await api();
  assert.equal(
    (await t.request("PATCH", patch({ expectedUpdatedAt: "old" }))).status,
    409,
  );
  assert.ok(!t.calls.some((c) => c[0] === "update"));
  t = await api({ conflict: true });
  assert.equal((await t.request("PATCH", patch())).status, 409);
  assert.ok(
    t.calls.some((c) => c[0] === "eq" && c[2] === "updated_at" && c[3] === now),
  );
});
test("leadership cannot complete review while steps are incomplete; any item change resets a recorded review", async () => {
  let t = await api();
  assert.equal(
    (await t.request("PATCH", patch({ action: "review" }))).status,
    400,
  );
  t = await api({
    plan: { ...plan(), reviewed_at: now, reviewed_by: "Earlier manager" },
  });
  assert.equal((await t.request("PATCH", patch())).status, 200);
  const change = t.calls.find((c) => c[0] === "update")[2];
  assert.equal(change.reviewed_at, null);
  assert.equal(change.updated_by, actor);
});
test("pre-account creation is scoped and dated, does not create auth accounts or send invitations", async () => {
  const t = await api({ noPlan: true });
  const response = await t.request("POST", {
    id: planId,
    fullName: "Synthetic New Hire",
    jobTitle: "Synthetic Teacher",
    startDate: "2026-11-01",
    locationId: location,
  });
  assert.equal(response.status, 201);
  const inserted = t.calls.find((c) => c[0] === "insert");
  assert.equal(inserted[1], "staff_onboarding_plans");
  assert.equal(inserted[2].staff_user_id, null);
  assert.equal(inserted[2].items.length, 22);
  assert.equal(t.calls.filter((c) => c[0] === "insert").length, 1);
});
test("staff onboarding is accessible in web/native navigation without granting other employee modules", async () => {
  const team = await import(url(await read("src/lib/team-access.ts")));
  assert.equal(team.employeeCanAccessRoute([], "/staff-onboarding"), true);
  assert.equal(team.employeeCanAccessRoute([], "/team-access"), false);
  for (const path of [
    "src/components/layout/MainLayout.tsx",
    "src/components/layout/MobileQuickActions.tsx",
    "src/app/(portal)/employees/page.tsx",
  ])
    assert.ok((await read(path)).includes("/staff-onboarding"));
});
test("hire-detail edits reschedule only pending steps and cannot move a hire to an unassigned site", async () => {
  const source = plan();
  source.items[1] = { ...source.items[1], status: "Submitted" };
  source.items[2] = { ...source.items[2], status: "Verified" };
  const details = {
    action: "details",
    fullName: "Synthetic Updated",
    email: "synthetic@example.invalid",
    jobTitle: "Synthetic Role",
    startDate: "2026-12-01",
    locationId: location,
    supervisor: "Synthetic New Supervisor",
    resetPendingDates: true,
  };
  const t = await api({ plan: source });
  assert.equal((await t.request("PATCH", patch(details))).status, 200);
  const change = t.calls.find((c) => c[0] === "update")[2];
  assert.equal(change.items[0].dueDate, "2026-11-30");
  assert.equal(change.items[1].dueDate, source.items[1].dueDate);
  assert.equal(change.items[2].dueDate, source.items[2].dueDate);
  assert.equal(change.reviewed_at, null);
  const foreign = await api();
  assert.equal(
    (
      await foreign.request(
        "PATCH",
        patch({ ...details, locationId: otherLocation }),
      )
    ).status,
    403,
  );
});
test("linking a nonexistent or unassigned account fails without saving or granting any access", async () => {
  const t = await api({ badLink: true });
  assert.equal(
    (await t.request("PATCH", patch({ action: "link", staffUserId: employee })))
      .status,
    400,
  );
  assert.ok(!t.calls.some((c) => c[0] === "update"));
});

test("new-hire creation IDs work in WebViews without crypto.randomUUID", () => {
  let seed = 0;
  const provider = {
    getRandomValues: (buffer) => {
      seed++;
      return buffer.fill(seed);
    },
  };
  const first = helper.newOnboardingRequestId(provider),
    second = helper.newOnboardingRequestId(provider);
  assert.match(
    first,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  assert.notEqual(first, second);
});

test("creation retries reuse the same record and reject changed details instead of silently dropping edits", async () => {
  const original = { ...plan(), created_by: actor };
  const body = {
    id: planId,
    fullName: original.full_name,
    email: original.email,
    jobTitle: original.job_title,
    startDate: original.start_date,
    locationId: original.location_id,
    supervisor: original.supervisor,
    staffUserId: employee,
  };
  const retry = await api({ plan: original });
  assert.equal((await retry.request("POST", body)).status, 200);
  assert.ok(!retry.calls.some((c) => c[0] === "insert"));
  const changed = await api({ plan: original });
  assert.equal(
    (await changed.request("POST", { ...body, jobTitle: "Changed role" }))
      .status,
    409,
  );
  assert.ok(!changed.calls.some((c) => c[0] === "insert"));
});
