import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const moduleUrl = (source) => "data:text/javascript;base64," + Buffer.from(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText).toString("base64");
const contactUrl = moduleUrl(await readFile("src/lib/staff-contact.ts", "utf8"));
const contact = await import(contactUrl);
const rolesUrl = moduleUrl(await readFile("src/lib/team-access.ts", "utf8"));
const adminUrl = moduleUrl("export const createSupabaseAdminClient = () => globalThis.contactAdmin;");
const imports = (source) => source
  .replace('import "server-only";', "")
  .replaceAll('"@/lib/staff-contact"', JSON.stringify(contactUrl))
  .replaceAll('"@/lib/team-access"', JSON.stringify(rolesUrl))
  .replaceAll('"@/lib/supabase/admin"', JSON.stringify(adminUrl));
const ownerUrl = moduleUrl(imports(await readFile("src/lib/server/require-owner.ts", "utf8")));
const staffUrl = moduleUrl(imports(await readFile("src/lib/server/require-staff.ts", "utf8"))
  .replace(/import \{ createClient, type SupabaseClient, type User \} from "@supabase\/supabase-js";/, "const createClient = () => ({});"));
const route = async (path) => import(moduleUrl(imports(await readFile(path, "utf8"))
  .replaceAll('"@/lib/server/require-owner"', JSON.stringify(ownerUrl))
  .replaceAll('"@/lib/server/require-staff"', JSON.stringify(staffUrl))));
const accept = await route("src/app/api/team-access/accept/route.ts");
const edit = await route("src/app/api/team-access/contact/route.ts");
const birthdays = await route("src/app/api/employee-lounge/birthdays/route.ts");
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.invalid";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "synthetic-test-key";

const details = { first_name: "Jordan", last_name: "Sample", phone: "(661) 555-0123", birthday_month: "", birthday_day: "" };
let rows, users, writes, reads, options;

function setup(overrides = {}) {
  options = overrides;
  writes = [];
  reads = [];
  rows = {
    staff_access: [
      { user_id: "owner", organization_id: "our-org", email: "owner@example.com", full_name: "Owner Example", role: "Owner / Admin", is_active: true, accepted_at: "2026-01-01" },
      { user_id: "staff", organization_id: "our-org", email: "staff@example.com", full_name: "Jordan Sample", role: "Employee", is_active: true, accepted_at: null },
      { user_id: "foreign", organization_id: "other-org", email: "foreign@example.com", full_name: "Other Sample", role: "Employee", is_active: true, accepted_at: "2026-01-01" },
      { user_id: "paused", organization_id: "our-org", email: "paused@example.com", full_name: "Paused Sample", role: "Employee", is_active: false, accepted_at: "2026-01-01" },
    ],
    staff_invitations: [{ organization_id: "our-org", email: "staff@example.com", status: "pending" }],
  };
  users = new Map(rows.staff_access.map((row) => [row.user_id, { id: row.user_id, email: row.email, user_metadata: { unrelated: "keep me" } }]));
  users.set("parent", { id: "parent", email: "parent@example.com", user_metadata: {} });
  globalThis.contactAdmin = {
    auth: {
      getUser: async (token) => ({ data: { user: users.get(token) ?? null }, error: null }),
      admin: {
        getUserById: async (id) => {
          reads.push(["auth", id]);
          return { data: { user: users.get(id) }, error: options.readError ? new Error("Auth unavailable") : null };
        },
        updateUserById: async (id, patch) => {
          if (options.metadataError) return { error: new Error("Save unavailable") };
          writes.push(["auth", id, structuredClone(patch)]);
          const user = users.get(id);
          user.user_metadata = { ...user.user_metadata, ...patch.user_metadata };
          return { data: { user }, error: null };
        },
      },
    },
    from(table) {
      const filters = [];
      let patch;
      const execute = () => {
        reads.push([table, structuredClone(filters)]);
        if (options.failTable === table) return { data: null, error: new Error("Database unavailable") };
        const found = (rows[table] ?? []).filter((row) => filters.every(([kind, key, value]) => {
          if (kind === "not-null") return row[key] != null;
          if (kind === "ilike") return String(row[key]).toLowerCase() === String(value).toLowerCase();
          return row[key] === value;
        }));
        if (patch) {
          writes.push([table, structuredClone(patch), structuredClone(filters)]);
          found.forEach((row) => Object.assign(row, patch));
        }
        return { data: found.map((row) => ({ ...row })), error: null };
      };
      const query = {
        select() { return query; },
        update(value) { patch = value; return query; },
        eq(key, value) { filters.push(["eq", key, value]); return query; },
        ilike(key, value) { filters.push(["ilike", key, value]); return query; },
        not(key, _operator, value) { assert.equal(value, null); filters.push(["not-null", key, value]); return query; },
        maybeSingle() { const result = execute(); return Promise.resolve({ ...result, data: result.data?.[0] ?? null }); },
        then(resolve, reject) { return Promise.resolve(execute()).then(resolve, reject); },
      };
      return query;
    },
  };
}

function request(method, body, token = "staff") {
  return new Request("https://hub.test/api/contact", {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const acceptBody = (contactDetails = details) => ({ email: "staff@example.com", contact: contactDetails });

test("birthday can be skipped while required names and phone are checked", () => {
  assert.deepEqual(contact.validateStaffContact(details).contact, details);
  for (const field of ["first_name", "last_name", "phone"]) {
    assert.ok(contact.validateStaffContact({ ...details, [field]: "   " }).error);
  }
});

test("names keep accents and compound surnames; valid international phones are accepted", () => {
  const result = contact.validateStaffContact({ ...details, first_name: "  Renée  ", last_name: "de la Cruz", phone: "+44 20 7946 0958" });
  assert.equal(result.contact.first_name, "Renée");
  assert.equal(result.contact.last_name, "de la Cruz");
  assert.equal(result.error, undefined);
});

test("invalid phones and malformed profile fields are rejected", () => {
  for (const phone of ["123", "123456789", "call me", "(661) 555-0123 ext 2", "+++++++++++", 6615550123]) {
    assert.ok(contact.validateStaffContact({ ...details, phone }).error);
  }
  for (const bad of [null, [], "name", { ...details, first_name: {} }, { ...details, last_name: "a".repeat(101) }]) assert.ok(contact.validateStaffContact(bad).error);
});

test("optional birthdays must be complete and valid, including February 29", () => {
  assert.equal(contact.validateStaffContact({ ...details, birthday_month: "2", birthday_day: "29" }).error, undefined);
  for (const [month, day] of [["2", "30"], ["4", "31"], ["13", "1"], ["1", ""], ["", "12"], ["1.5", "2"], [true, "1"]]) {
    assert.ok(contact.validateStaffContact({ ...details, birthday_month: month, birthday_day: day }).error);
  }
});

test("saved contact reader ignores invalid birthdays and preserves existing name defaults", () => {
  assert.deepEqual(contact.readStaffContact({}, "Taylor de la Cruz"), { first_name: "Taylor", last_name: "de la Cruz", phone: "", birthday_month: "", birthday_day: "" });
  assert.equal(contact.readStaffContact({ tcs_staff_contact: { birthday_month: 4, birthday_day: 31 } }).birthday_month, "");
});

test("month selection uses California time and birthdays sort by day", () => {
  assert.equal(contact.birthdayMonthNow(new Date("2026-02-01T02:00:00Z")), 1);
  const entries = [{ id: "a", name: "A", month: 2, day: 29 }, { id: "b", name: "B", month: 2, day: 1 }, { id: "c", name: "C", month: 3, day: 1 }, { id: "d", name: "D", month: 2, day: 30 }];
  assert.deepEqual(contact.birthdaysInMonth(entries, 2).map((item) => item.id), ["b", "a"]);
  assert.equal(contact.formatBirthday(2, 29), "February 29");
});

test("accepting an invitation requires a valid signed-in staff account", async () => {
  for (const token of ["", "invalid", "parent", "paused"]) {
    setup();
    assert.ok([401, 403].includes((await accept.POST(request("POST", acceptBody(), token))).status));
    assert.equal(writes.length, 0);
  }
});

test("server rejects each missing contact field before activating the invitation", async () => {
  for (const field of ["first_name", "last_name", "phone"]) {
    setup();
    assert.equal((await accept.POST(request("POST", acceptBody({ ...details, [field]: " " })))).status, 400);
    assert.equal(writes.length, 0);
    assert.equal(rows.staff_access[1].accepted_at, null);
  }
});

test("email must match the authenticated invitation and cannot be omitted or replaced", async () => {
  for (const email of [undefined, "other@example.com", "", {}]) {
    setup();
    assert.equal((await accept.POST(request("POST", { ...acceptBody(), email }))).status, 400);
    assert.equal(writes.length, 0);
  }
  setup(); users.get("staff").email = "changed@example.com";
  assert.equal((await accept.POST(request("POST", { ...acceptBody(), email: "changed@example.com" }))).status, 400);
});

test("valid setup without a birthday saves contacts and activates only the signed-in account", async () => {
  setup();
  const result = await accept.POST(request("POST", { ...acceptBody(), user_id: "foreign", role: "Owner / Admin" }));
  assert.equal(result.status, 200);
  assert.deepEqual(users.get("staff").user_metadata.tcs_staff_contact, details);
  assert.equal(users.get("staff").user_metadata.unrelated, "keep me");
  assert.ok(rows.staff_access[1].accepted_at);
  assert.equal(rows.staff_access[1].role, "Employee");
  assert.equal(rows.staff_access[1].full_name, "Jordan Sample");
  assert.equal(users.get("foreign").user_metadata.tcs_staff_contact, undefined);
  assert.equal(rows.staff_invitations[0].status, "accepted");
});

test("self-entered contact names never overwrite trusted staff identity or permissions", async () => {
  setup();
  const result = await accept.POST(request("POST", acceptBody({ ...details, first_name: "Danielle", last_name: "Moore", tcs_role: "Owner / Admin", birth_year: 1980 })));
  assert.equal(result.status, 200);
  assert.equal(rows.staff_access[1].full_name, "Jordan Sample");
  assert.equal(rows.staff_access[1].role, "Employee");
  assert.equal(users.get("staff").user_metadata.tcs_role, undefined);
  assert.equal(users.get("staff").user_metadata.tcs_staff_contact.birth_year, undefined);
});

test("failed contact storage or invitation storage does not mark setup complete", async () => {
  for (const option of [{ metadataError: true }, { failTable: "staff_invitations" }]) {
    setup(option);
    assert.equal((await accept.POST(request("POST", acceptBody()))).status, 500);
    assert.equal(rows.staff_access[1].accepted_at, null);
    assert.equal(writes.filter(([table]) => table === "staff_access").length, 0);
  }
});

test("repeated acceptance preserves the original accepted date", async () => {
  setup(); rows.staff_access[1].accepted_at = "2026-01-02";
  assert.equal((await accept.POST(request("POST", acceptBody()))).status, 200);
  assert.equal(rows.staff_access[1].accepted_at, "2026-01-02");
});

test("owner can add only a birthday to an older account with no phone", async () => {
  setup();
  const updated = { first_name: "Jordan", last_name: "Sample", phone: "", birthday_month: "2", birthday_day: "29" };
  assert.equal((await edit.PATCH(request("PATCH", { user_id: "staff", contact: updated }, "owner"))).status, 200);
  assert.deepEqual(users.get("staff").user_metadata.tcs_staff_contact, updated);
  assert.equal(users.get("staff").user_metadata.unrelated, "keep me");
  assert.equal(rows.staff_access[1].accepted_at, null);
});

test("owner can correct or clear a birthday later", async () => {
  setup();
  for (const updated of [{ ...details, birthday_month: "6", birthday_day: "5" }, details]) {
    assert.equal((await edit.PATCH(request("PATCH", { user_id: "staff", contact: updated }, "owner"))).status, 200);
    assert.deepEqual(users.get("staff").user_metadata.tcs_staff_contact, updated);
  }
});

test("contact editing denies non-owners, paused accounts, and targets outside the organization", async () => {
  for (const token of ["staff", "parent", "paused", ""]) {
    setup();
    assert.ok([401, 403].includes((await edit.PATCH(request("PATCH", { user_id: "staff", contact: details }, token))).status));
    assert.equal(writes.length, 0);
  }
  setup();
  assert.equal((await edit.PATCH(request("PATCH", { user_id: "foreign", contact: details }, "owner"))).status, 404);
  assert.equal(writes.length, 0);
});

test("admin save rejects invalid dates and reports storage failures", async () => {
  setup();
  assert.equal((await edit.PATCH(request("PATCH", { user_id: "staff", contact: { ...details, birthday_month: "4", birthday_day: "31" } }, "owner"))).status, 400);
  assert.equal(writes.length, 0);
  setup({ metadataError: true });
  assert.equal((await edit.PATCH(request("PATCH", { user_id: "staff", contact: details }, "owner"))).status, 500);
});

test("birthday board returns only active accepted colleagues in the same organization", async () => {
  setup();
  for (const person of users.values()) person.user_metadata.tcs_staff_contact = { ...details, birthday_month: String(contact.birthdayMonthNow()), birthday_day: "3" };
  const response = await birthdays.GET(request("GET", undefined, "staff"));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.birthdays, [{ id: "owner", name: "Owner Example", month: contact.birthdayMonthNow(), day: 3 }]);
  assert.deepEqual(reads.filter(([table]) => table === "auth").map(([, id]) => id), ["owner"]);
  assert.deepEqual(Object.keys(payload.birthdays[0]).sort(), ["day", "id", "month", "name"]);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("birthday board requires active staff and reports failed reads instead of showing an empty board", async () => {
  for (const token of ["", "parent", "paused"]) {
    setup();
    assert.ok([401, 403].includes((await birthdays.GET(request("GET", undefined, token))).status));
  }
  setup({ readError: true });
  assert.equal((await birthdays.GET(request("GET", undefined))).status, 500);
});
