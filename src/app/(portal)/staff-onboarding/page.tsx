"use client";

import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import { hubRequest } from "@/lib/hub-request";
import {
  newOnboardingRequestId,
  onboardingStages,
  onboardingSummary,
  onboardingToday,
  onboardingItemComplete,
  type OnboardingItem,
  type OnboardingPlan,
  type OnboardingStatus,
} from "@/lib/staff-onboarding";
import {
  ClipboardCheck,
  LoaderCircle,
  Plus,
  Search,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

type Payload = {
  plans: OnboardingPlan[];
  locations: Array<{ id: string; name: string }>;
  staff: Array<{ userId: string; fullName: string; locationIds: string[] }>;
  canManage: boolean;
  nextPage: number | null;
};
const field =
  "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base font-semibold text-slate-900";
const button =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-3 text-base font-bold text-white disabled:opacity-50";
const emptyForm = {
  fullName: "",
  email: "",
  jobTitle: "",
  startDate: "",
  locationId: "",
  supervisor: "",
  staffUserId: "",
};
export default function StaffOnboardingPage() {
  const { session, isSystemOwner } = useAuth();
  const [data, setData] = useState<Payload | null>(null),
    [selectedId, setSelectedId] = useState(""),
    [search, setSearch] = useState(""),
    [archived, setArchived] = useState(false),
    [loading, setLoading] = useState(true),
    [working, setWorking] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [showCreate, setShowCreate] = useState(false),
    [form, setForm] = useState(emptyForm),
    [createId, setCreateId] = useState(() => newOnboardingRequestId());
  const [itemFilter, setItemFilter] = useState("All steps");
  const token = session?.access_token;
  const loadGeneration = useRef(0);
  const call = useCallback(
    <T,>(method: string, body?: Record<string, unknown>) => {
      if (!token) throw new Error("Your staff session is not ready.");
      return hubRequest<T>("/api/staff-onboarding", token, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    },
    [token],
  );
  const load = useCallback(
    async (page = 0) => {
      if (!token) return;
      const generation = ++loadGeneration.current;
      try {
        const next = await hubRequest<Payload>(
          `/api/staff-onboarding?archived=${archived}&page=${page}`,
          token,
        );
        if (generation !== loadGeneration.current) return;
        setError("");
        setData((current) =>
          page && current
            ? {
                ...next,
                plans: [
                  ...current.plans,
                  ...next.plans.filter(
                    (plan) => !current.plans.some((old) => old.id === plan.id),
                  ),
                ],
              }
            : next,
        );
        if (!page)
          setSelectedId((current) =>
            next.plans.some((plan) => plan.id === current)
              ? current
              : next.plans[0]?.id || "",
          );
      } catch (caught) {
        if (generation === loadGeneration.current)
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load onboarding.",
          );
      } finally {
        if (generation === loadGeneration.current) setLoading(false);
      }
    },
    [token, archived],
  );
  const cancelLoad = useCallback(() => {
    loadGeneration.current++;
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void load();
    });
    return () => {
      active = false;
      cancelLoad();
    };
  }, [load, cancelLoad]);
  const selected = data?.plans.find((plan) => plan.id === selectedId);
  const today = onboardingToday();
  const filtered = useMemo(
    () =>
      data?.plans.filter((plan) =>
        [plan.full_name, plan.job_title, plan.supervisor, plan.email]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase()),
      ) ?? [],
    [data, search],
  );
  const stats = data?.plans.reduce(
    (totals, plan) => {
      const summary = onboardingSummary(plan.items, today);
      return {
        overdue: totals.overdue + summary.overdue,
        submitted: totals.submitted + summary.submitted,
        expired: totals.expired + summary.expired,
      };
    },
    { overdue: 0, submitted: 0, expired: 0 },
  );
  async function change(body: Record<string, unknown>, message: string) {
    if (!selected) return;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      await call("PATCH", {
        id: selected.id,
        expectedUpdatedAt: selected.updated_at,
        ...body,
      });
      setNotice(message);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The change was not saved.",
      );
    } finally {
      setWorking(false);
    }
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const result = await call<{ id: string }>("POST", {
        id: createId,
        ...form,
      });
      setForm(emptyForm);
      setCreateId(newOnboardingRequestId());
      setShowCreate(false);
      await load();
      setSelectedId(result.id);
      setNotice(
        "New-hire checklist created. No account or invitation was created.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not create the checklist.",
      );
    } finally {
      setWorking(false);
    }
  }
  async function createCheckins() {
    if (!selected?.staff_user_id || !token) return;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      await hubRequest("/api/employee-checkins", token, {
        method: "POST",
        body: JSON.stringify({
          action: "create_plan",
          staffUserId: selected.staff_user_id,
          locationId: selected.location_id,
          startDate: selected.start_date,
        }),
      });
      setNotice(
        "30/60/90 reviews created. Open Check-Ins to complete the reflections and reviews.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not create check-ins.",
      );
    } finally {
      setWorking(false);
    }
  }
  return (
    <MainLayout>
      <div className="mx-auto max-w-[1500px] space-y-5 pb-12">
        <section className="rounded-[28px] bg-gradient-to-br from-emerald-950 to-emerald-700 p-6 text-white shadow-lg">
          <p className="text-base font-bold uppercase tracking-widest text-emerald-100">
            The Hub • People & growth
          </p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">
            New-Hire Onboarding
          </h1>
          <p className="mt-3 max-w-3xl text-lg leading-relaxed">
            One place to follow each new hire from before the first day through
            90 days. Track the next step, who owns it, and what leadership has
            verified.
          </p>
          <nav
            aria-label="Employee tools"
            className="mt-5 flex flex-wrap gap-3"
          >
            <Link
              className="rounded-xl bg-white px-4 py-3 font-bold text-emerald-950"
              href="/training-center"
            >
              Training Center
            </Link>
            <Link
              className="rounded-xl bg-white px-4 py-3 font-bold text-emerald-950"
              href="/employee-checkins"
            >
              30/60/90 Check-Ins
            </Link>
            {data?.canManage && (
              <Link
                className="rounded-xl bg-white px-4 py-3 font-bold text-emerald-950"
                href="/employees"
              >
                Employees
              </Link>
            )}
            {isSystemOwner && (
              <Link
                className="rounded-xl bg-white px-4 py-3 font-bold text-emerald-950"
                href="/team-access"
              >
                Team Access
              </Link>
            )}
          </nav>
        </section>
        {error && (
          <div
            role="alert"
            className="rounded-2xl border border-red-300 bg-red-50 p-4 text-base font-bold text-red-900"
          >
            {error}
            <button
              onClick={() => void load()}
              disabled={working}
              className="ml-3 min-h-11 underline"
            >
              Reload checklist
            </button>
          </div>
        )}
        {notice && (
          <p
            role="status"
            className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 font-bold text-emerald-950"
          >
            {notice}
          </p>
        )}
        <section
          className="grid gap-3 sm:grid-cols-4"
          aria-label="Loaded onboarding records"
        >
          <Stat
            label={archived ? "Archived checklists" : "Active checklists"}
            value={data?.plans.length || 0}
          />
          <Stat label="Overdue steps" value={stats?.overdue || 0} />
          <Stat label="Awaiting verification" value={stats?.submitted || 0} />
          <Stat label="Expired proof" value={stats?.expired || 0} />
        </section>
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-56 flex-1">
            <span className="sr-only">Search loaded checklists</span>
            <Search className="pointer-events-none absolute left-3 top-3.5 h-5 w-5 text-slate-600" />
            <input
              className={`${field} pl-10`}
              placeholder="Search loaded hires, roles or supervisors…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="flex min-h-11 items-center gap-2 font-semibold">
            <input
              type="checkbox"
              checked={archived}
              onChange={(event) => {
                setArchived(event.target.checked);
                setData(null);
                setLoading(true);
              }}
            />{" "}
            Show archived
          </label>
          {data?.canManage && (
            <button
              className={button}
              onClick={() => setShowCreate((value) => !value)}
              disabled={working || archived}
            >
              <Plus className="h-5 w-5" />
              New hire
            </button>
          )}
        </div>
        {showCreate && data?.canManage && (
          <form
            onSubmit={(event) => void create(event)}
            className="space-y-4 rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm"
          >
            <h2 className="text-2xl font-black text-slate-950">
              Start a new-hire checklist
            </h2>
            <p className="text-base text-slate-700">
              Start before the Hub invitation. Link an approved account now or
              later; this form does not send an invitation.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Full name">
                <input
                  required
                  maxLength={160}
                  className={field}
                  value={form.fullName}
                  onChange={(event) =>
                    setForm({ ...form, fullName: event.target.value })
                  }
                />
              </Field>
              <Field label="Email (optional)">
                <input
                  type="email"
                  maxLength={254}
                  className={field}
                  value={form.email}
                  onChange={(event) =>
                    setForm({ ...form, email: event.target.value })
                  }
                />
              </Field>
              <Field label="Role / job title">
                <input
                  required
                  maxLength={160}
                  className={field}
                  value={form.jobTitle}
                  onChange={(event) =>
                    setForm({ ...form, jobTitle: event.target.value })
                  }
                />
              </Field>
              <Field label="Employment start date">
                <input
                  required
                  type="date"
                  className={field}
                  value={form.startDate}
                  onChange={(event) =>
                    setForm({ ...form, startDate: event.target.value })
                  }
                />
              </Field>
              <Field label="Location">
                <select
                  required
                  className={field}
                  value={form.locationId}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      locationId: event.target.value,
                      staffUserId: "",
                    })
                  }
                >
                  <option value="">Choose assigned location…</option>
                  {data.locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Supervisor / default task owner">
                <input
                  maxLength={160}
                  className={field}
                  placeholder="Defaults to you"
                  value={form.supervisor}
                  onChange={(event) =>
                    setForm({ ...form, supervisor: event.target.value })
                  }
                />
              </Field>
              <Field label="Approved Hub account (optional)">
                <select
                  className={field}
                  value={form.staffUserId}
                  onChange={(event) =>
                    setForm({ ...form, staffUserId: event.target.value })
                  }
                >
                  <option value="">Not linked yet</option>
                  {data.staff
                    .filter((person) =>
                      person.locationIds.includes(form.locationId),
                    )
                    .map((person) => (
                      <option key={person.userId} value={person.userId}>
                        {person.fullName}
                      </option>
                    ))}
                </select>
              </Field>
            </div>
            <p className="text-base text-slate-700">
              Checklist dates are planning defaults. Leadership must confirm
              applicable requirements and clearance before assigning duties.
            </p>
            <button className={button} disabled={working}>
              {working ? (
                <LoaderCircle className="h-5 w-5 animate-spin" />
              ) : (
                <ClipboardCheck className="h-5 w-5" />
              )}
              Create checklist
            </button>
          </form>
        )}
        {loading && !data ? (
          <p className="rounded-3xl bg-white p-8 font-bold">
            Loading onboarding…
          </p>
        ) : (
          data && (
            <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
              <aside className="space-y-3" aria-label="New hires">
                {filtered.map((plan) => {
                  const progress = onboardingSummary(plan.items, today);
                  return (
                    <button
                      key={plan.id}
                      onClick={() => {
                        setSelectedId(plan.id);
                        setItemFilter("All steps");
                      }}
                      aria-pressed={selectedId === plan.id}
                      className={`w-full rounded-2xl border p-4 text-left ${selectedId === plan.id ? "border-emerald-700 bg-emerald-50 ring-2 ring-emerald-700" : "border-slate-200 bg-white"}`}
                    >
                      <strong className="block text-lg text-slate-950">
                        {plan.full_name}
                      </strong>
                      <span className="mt-1 block text-base text-slate-700">
                        {plan.job_title} • starts {plan.start_date}
                      </span>
                      <span className="mt-2 block font-bold text-emerald-900">
                        {progress.complete}/{progress.total} verified / not
                        applicable
                      </span>
                      {progress.overdue > 0 && (
                        <span className="mt-1 block font-bold text-red-800">
                          {progress.overdue} overdue
                        </span>
                      )}
                    </button>
                  );
                })}
                {!filtered.length && (
                  <p className="rounded-2xl border border-slate-200 bg-white p-5 text-base text-slate-700">
                    {data.canManage
                      ? "No checklists here yet. Choose New hire to start one."
                      : "No onboarding checklist is linked to your account yet. Ask your supervisor to link it."}
                  </p>
                )}
                {data.nextPage !== null && (
                  <button
                    className={button}
                    disabled={loading}
                    onClick={() => void load(data.nextPage!)}
                  >
                    Load more checklists
                  </button>
                )}
              </aside>
              {selected ? (
                <section className="min-w-0 space-y-4">
                  <div className="rounded-3xl border border-slate-200 bg-white p-5">
                    <h2 className="text-2xl font-black text-slate-950">
                      {selected.full_name}
                    </h2>
                    <p className="mt-2 text-base text-slate-700">
                      {selected.job_title} •{" "}
                      {data.locations.find(
                        (loc) => loc.id === selected.location_id,
                      )?.name || "Assigned location"}{" "}
                      • Supervisor: {selected.supervisor}
                    </p>
                    <p className="mt-2 text-base text-slate-700">
                      Keep identity, health and employment documents in the
                      restricted employee file. Record completion here; do not
                      enter Social Security numbers, medical details or document
                      images in notes.
                    </p>
                    {data.canManage && (
                      <div className="mt-4 space-y-3">
                        <DetailsEditor
                          key={`details-${selected.id}-${selected.updated_at}`}
                          plan={selected}
                          locations={data.locations}
                          disabled={working || archived}
                          save={(values) =>
                            void change(
                              { action: "details", ...values },
                              "New-hire details saved.",
                            )
                          }
                        />
                        <AccountLink
                          key={`${selected.id}-${selected.updated_at}`}
                          plan={selected}
                          staff={data.staff}
                          disabled={working}
                          save={(staffUserId) =>
                            void change(
                              { action: "link", staffUserId },
                              "Account link saved. No invitation was sent.",
                            )
                          }
                        />
                        <div className="flex flex-wrap gap-3">
                          <button
                            className={button}
                            disabled={
                              working || !selected.staff_user_id || archived
                            }
                            onClick={() => void createCheckins()}
                          >
                            Create 30/60/90 reviews
                          </button>
                          <button
                            className="min-h-11 rounded-xl border border-slate-300 px-4 py-3 font-bold"
                            disabled={working}
                            onClick={() =>
                              void change(
                                { action: archived ? "restore" : "archive" },
                                archived
                                  ? "Record restored."
                                  : "Record archived; its history is kept.",
                              )
                            }
                          >
                            {archived ? "Restore record" : "Archive record"}
                          </button>
                        </div>
                        {!selected.staff_user_id && (
                          <p className="text-base text-slate-700">
                            Link an approved account before creating the
                            employee reflection/review plan.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-xl font-black">Onboarding steps</h3>
                    <label className="flex items-center gap-2 font-bold">
                      Show
                      <select
                        className={field}
                        value={itemFilter}
                        onChange={(event) => setItemFilter(event.target.value)}
                      >
                        {[
                          "All steps",
                          "Needs attention",
                          "Awaiting verification",
                        ].map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {onboardingStages.map((stage) => {
                    const items = selected.items.filter(
                      (item) =>
                        item.stage === stage &&
                        (itemFilter === "All steps" ||
                          (itemFilter === "Awaiting verification" &&
                            item.status === "Submitted") ||
                          (itemFilter === "Needs attention" &&
                            !onboardingItemComplete(item, today))),
                    );
                    return items.length ? (
                      <div key={stage} className="space-y-3">
                        <h3 className="text-xl font-black text-emerald-950">
                          {stage}
                        </h3>
                        {items.map((item) => (
                          <ItemEditor
                            key={`${selected.id}-${selected.updated_at}-${item.id}`}
                            item={item}
                            canManage={data.canManage}
                            disabled={working || archived}
                            today={today}
                            save={(value) =>
                              void change(
                                {
                                  action: "item",
                                  itemId: item.id,
                                  item: value,
                                },
                                "Checklist step saved.",
                              )
                            }
                          />
                        ))}
                      </div>
                    ) : null;
                  })}
                  <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
                    <h3 className="text-xl font-black text-emerald-950">
                      Leadership checklist review
                    </h3>
                    <p className="mt-2 text-base text-emerald-950">
                      This records review of the checklist. It does not
                      automatically clear someone for employment or independent
                      supervision.
                    </p>
                    {selected.reviewed_at && (
                      <p className="mt-2 font-bold text-emerald-950">
                        Last recorded by {selected.reviewed_by} on{" "}
                        {new Date(selected.reviewed_at).toLocaleDateString()}
                        {!onboardingSummary(selected.items, today)
                          .readyForReview
                          ? " • Renewal or further review needed"
                          : ""}
                      </p>
                    )}
                    {data.canManage && (
                      <button
                        className={`${button} mt-4`}
                        disabled={
                          working ||
                          archived ||
                          !onboardingSummary(selected.items, today)
                            .readyForReview
                        }
                        onClick={() =>
                          void change(
                            { action: "review" },
                            "Leadership checklist review recorded.",
                          )
                        }
                      >
                        <ShieldCheck className="h-5 w-5" />
                        Record completed checklist review
                      </button>
                    )}
                  </div>
                </section>
              ) : null}
            </div>
          )
        )}
        <p className="text-base text-slate-600">
          Counts cover the loaded checklists. Use Load more to reach older
          records. Nothing is sent to a new hire until leadership uses the
          existing invitation or communication tools.
        </p>
      </div>
    </MainLayout>
  );
}
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-base font-bold text-slate-700">{label}</p>
      <strong className="mt-2 block text-3xl font-black text-emerald-950">
        {value}
      </strong>
    </div>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2 text-base font-bold text-slate-800">
      <span>{label}</span>
      {children}
    </label>
  );
}
function AccountLink({
  plan,
  staff,
  disabled,
  save,
}: {
  plan: OnboardingPlan;
  staff: Payload["staff"];
  disabled: boolean;
  save: (id: string) => void;
}) {
  const [value, setValue] = useState(plan.staff_user_id || "");
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-56 flex-1">
        <Field label="Linked approved Hub account">
          <select
            className={field}
            value={value}
            disabled={disabled}
            onChange={(event) => setValue(event.target.value)}
          >
            <option value="">Not linked yet</option>
            {staff
              .filter((person) => person.locationIds.includes(plan.location_id))
              .map((person) => (
                <option key={person.userId} value={person.userId}>
                  {person.fullName}
                </option>
              ))}
          </select>
        </Field>
      </div>
      <button
        className={button}
        disabled={disabled || value === (plan.staff_user_id || "")}
        onClick={() => save(value)}
      >
        Save account link
      </button>
    </div>
  );
}
function ItemEditor({
  item,
  canManage,
  disabled,
  today,
  save,
}: {
  item: OnboardingItem;
  canManage: boolean;
  disabled: boolean;
  today: string;
  save: (value: Record<string, unknown>) => void;
}) {
  const [status, setStatus] = useState<OnboardingStatus>(item.status),
    [dueDate, setDueDate] = useState(item.dueDate),
    [owner, setOwner] = useState(item.owner),
    [expiresOn, setExpiresOn] = useState(item.expiresOn),
    [note, setNote] = useState(item.note);
  const locked =
    disabled ||
    (!canManage && ["Verified", "Not applicable"].includes(item.status));
  const dirty =
    status !== item.status ||
    dueDate !== item.dueDate ||
    owner !== item.owner ||
    expiresOn !== item.expiresOn ||
    note !== item.note;
  const overdue = !onboardingItemComplete(item, today) && item.dueDate < today,
    expired =
      item.status === "Verified" && item.expiresOn && item.expiresOn < today;
  const statuses = canManage
    ? ["Pending", "Submitted", "Verified", "Not applicable"]
    : [
        "Pending",
        "Submitted",
        ...(["Verified", "Not applicable"].includes(item.status)
          ? [item.status]
          : []),
      ];
  return (
    <article
      className={`space-y-4 rounded-2xl border bg-white p-4 shadow-sm ${overdue || expired ? "border-amber-400" : "border-slate-200"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="max-w-2xl text-lg font-black text-slate-950">
          {item.title}
        </h4>
        <span
          className={`rounded-full px-3 py-1 font-bold ${expired || overdue ? "bg-amber-100 text-amber-950" : "bg-emerald-50 text-emerald-950"}`}
        >
          {expired ? "Proof expired" : overdue ? "Overdue" : item.status}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label={`Status: ${item.title}`}>
          <select
            className={field}
            disabled={locked}
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as OnboardingStatus)
            }
          >
            {statuses.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </Field>
        <Field label="Task owner">
          <input
            className={field}
            maxLength={160}
            readOnly={!canManage}
            disabled={locked}
            value={owner}
            onChange={(event) => setOwner(event.target.value)}
          />
        </Field>
        <Field label="Due date">
          <input
            type="date"
            className={field}
            readOnly={!canManage}
            disabled={locked}
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </Field>
        <Field label="Proof expires (if applicable)">
          <input
            type="date"
            className={field}
            readOnly={!canManage}
            disabled={locked}
            value={expiresOn}
            onChange={(event) => setExpiresOn(event.target.value)}
          />
        </Field>
      </div>
      <Field label="Completion note / reason not applicable">
        <textarea
          rows={2}
          maxLength={1000}
          className={field}
          disabled={locked}
          placeholder="Completion or follow-up only; keep sensitive documents in the restricted employee file."
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-base text-slate-700">
          {item.submittedAt && (
            <p>
              Submitted by {item.submittedBy} •{" "}
              {new Date(item.submittedAt).toLocaleDateString()}
            </p>
          )}
          {item.verifiedAt && (
            <p>
              Verified by {item.verifiedBy} •{" "}
              {new Date(item.verifiedAt).toLocaleDateString()}
            </p>
          )}
        </div>
        <button
          className={button}
          disabled={locked || !dirty}
          onClick={() => save({ status, dueDate, owner, expiresOn, note })}
        >
          Save step
        </button>
      </div>
    </article>
  );
}

function DetailsEditor({
  plan,
  locations,
  disabled,
  save,
}: {
  plan: OnboardingPlan;
  locations: Payload["locations"];
  disabled: boolean;
  save: (value: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false),
    [values, setValues] = useState({
      fullName: plan.full_name,
      email: plan.email,
      jobTitle: plan.job_title,
      startDate: plan.start_date,
      locationId: plan.location_id,
      supervisor: plan.supervisor,
      resetPendingDates: false,
    });
  if (!open)
    return (
      <button
        className="min-h-11 rounded-xl border border-slate-300 px-4 py-3 font-bold"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        Edit hire details
      </button>
    );
  return (
    <form
      className="space-y-4 rounded-2xl border border-slate-200 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        save(values);
      }}
    >
      <h3 className="text-xl font-black">Edit hire details</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name">
          <input
            required
            maxLength={160}
            className={field}
            value={values.fullName}
            onChange={(event) =>
              setValues({ ...values, fullName: event.target.value })
            }
          />
        </Field>
        <Field label="Email (optional)">
          <input
            type="email"
            maxLength={254}
            className={field}
            value={values.email}
            onChange={(event) =>
              setValues({ ...values, email: event.target.value })
            }
          />
        </Field>
        <Field label="Role / job title">
          <input
            required
            maxLength={160}
            className={field}
            value={values.jobTitle}
            onChange={(event) =>
              setValues({ ...values, jobTitle: event.target.value })
            }
          />
        </Field>
        <Field label="Employment start date">
          <input
            type="date"
            required
            className={field}
            value={values.startDate}
            onChange={(event) =>
              setValues({ ...values, startDate: event.target.value })
            }
          />
        </Field>
        <Field label="Location">
          <select
            required
            className={field}
            value={values.locationId}
            onChange={(event) =>
              setValues({ ...values, locationId: event.target.value })
            }
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Supervisor">
          <input
            required
            maxLength={160}
            className={field}
            value={values.supervisor}
            onChange={(event) =>
              setValues({ ...values, supervisor: event.target.value })
            }
          />
        </Field>
      </div>
      <label className="flex min-h-11 items-center gap-3 font-semibold">
        <input
          type="checkbox"
          checked={values.resetPendingDates}
          onChange={(event) =>
            setValues({ ...values, resetPendingDates: event.target.checked })
          }
        />
        If the start date changes, reset pending step dates to the new schedule.
      </label>
      <p className="text-base text-slate-700">
        Submitted and verified step dates stay recorded. A linked account must
        be assigned to the selected location.
      </p>
      <div className="flex gap-3">
        <button className={button} disabled={disabled}>
          Save hire details
        </button>
        <button
          type="button"
          className="min-h-11 px-4 font-bold underline"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
