"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Clock3, Pencil, Search, UsersRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { ChildPlanEditor, SchoolNotesEditor, siteLabel } from "@/components/scheduling/ChildPlanEditor";
import { useDatedCarePlan } from "@/hooks/useDatedCarePlan";
import { usePersistentState } from "@/hooks/usePersistentState";
import { canApproveChildSchedules } from "@/lib/child-schedule-authority";
import {
  compactTime,
  starterChildSchedules,
  timeToMinutes,
  type ChildScheduleRecord,
} from "@/lib/child-schedules";
import { addIsoDays, displayDate, mondayOfWeek, weekDates } from "@/lib/family-care-calendar";
import { normalizeLocation } from "@/lib/location-config";
import { buildDailyRatio, closedSites, planForDate, type DayRow } from "@/lib/weekly-care-planner";
import css from "./weekly-care-planner.module.css";

function blockTime(start: string, end: string) {
  return `${compactTime(timeToMinutes(start))}–${compactTime(timeToMinutes(end))}`;
}

export default function WeeklyCarePlanner({
  initialDate,
  initialLocation,
}: {
  initialDate: string;
  initialLocation: string;
}) {
  const { profile } = useAuth();
  const { location, setLocation } = useHubLocation();
  const [regular, , regularReady, regularLoad] = usePersistentState<ChildScheduleRecord[]>(
    "tcs-child-schedules-v2",
    starterChildSchedules,
  );
  const [date, setDate] = useState(initialDate);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<DayRow | null>(null);
  const [editNotes, setEditNotes] = useState(false);
  const [visitor, setVisitor] = useState(false);
  const applyLinkedSite = useRef(true);
  const [notice, setNotice] = useState("");
  const week = mondayOfWeek(date);
  const days = weekDates(week);
  const planner = useDatedCarePlan(week, days[6]);
  const { data } = planner;
  useEffect(() => {
    const match = initialLocation && data.locations.find((s) => normalizeLocation(s.name) === initialLocation);
    if (applyLinkedSite.current && match) {
      applyLinkedSite.current = false;
      setLocation(normalizeLocation(match.name));
    }
  }, [initialLocation, data.locations, setLocation]);
  const site =
    data.locations.find((s) => normalizeLocation(s.name) === location) ??
    data.locations.find(
      (s) => normalizeLocation(s.name) === normalizeLocation(profile?.primary_location || ""),
    ) ??
    data.locations.find((s) => normalizeLocation(s.name) === "Halcom") ??
    data.locations[0];
  const siteId = site?.id ?? "";
  const canEdit = canApproveChildSchedules(profile);
  const rows = useMemo(() => planForDate(data, regular, date), [data, regular, date]);
  const siteRows = rows.filter(
    (row) => row.child.location_id === siteId || row.blocks.some((b) => b.locationId === siteId),
  );
  const isClosed = closedSites(data, date).has(siteId);
  const scheduled = siteRows.filter(
    (row) => !isClosed && row.status === "scheduled" && row.blocks.some((b) => b.locationId === siteId),
  );
  const pending = siteRows.filter((row) => row.status === "pending");
  const noCare = siteRows.filter((row) => row.status === "no-care");
  const elsewhere = siteRows.filter(
    (row) => row.status === "scheduled" && !row.blocks.some((b) => b.locationId === siteId),
  );
  const visitors = rows.filter((row) => !siteRows.includes(row));
  const notes = data.schools.find((n) => n.location_id === siteId && n.service_date === date);
  const ratio = buildDailyRatio(siteRows, siteId, isClosed);
  const partial = !isClosed && pending.length > 0;
  const awaiting = partial && !scheduled.length;
  const firstArrival = (r: DayRow) =>
    r.blocks
      .filter((b) => b.locationId === siteId)
      .map((b) => b.start)
      .sort()[0] || "24:00";
  const sort = (a: DayRow, b: DayRow) =>
    firstArrival(a).localeCompare(firstArrival(b)) || a.name.localeCompare(b.name);
  const groups = [
    { title: "Morning arrivals", items: scheduled.filter((r) => firstArrival(r) < "12:00").sort(sort) },
    {
      title: "Afternoon & evening arrivals",
      items: scheduled.filter((r) => firstArrival(r) >= "12:00").sort(sort),
    },
    { title: "Awaiting schedule", items: pending },
    { title: "No Care", items: noCare },
    { title: "Scheduled at another site", items: elsewhere },
    ...(isClosed
      ? [
          {
            title: "Scheduled during closure",
            items: siteRows.filter((r) => r.blocks.some((b) => b.locationId === siteId)),
          },
        ]
      : []),
  ];
  function changeDate(next: string) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(next)) {
      setDate(next);
      setNotice("");
      setVisitor(false);
    }
  }
  function saved(message: string) {
    setEditing(null);
    setEditNotes(false);
    setNotice(message);
  }
  const planLink = `/ratios?date=${date}&location=${encodeURIComponent(normalizeLocation(site?.name ?? ""))}`;
  const error = planner.error || regularLoad.error;
  const ready = planner.ready && regularReady && !error;
  return (
    <MainLayout>
      <div className={css.planner}>
        <header className={css.head}>
          <div>
            <h1>Child Schedules</h1>
            <p>Enter contracted hours and plan coverage for the week.</p>
          </div>
          <Link className={css.secondary} href="/child-schedules/regular">
            Usual weekly hours
          </Link>
        </header>
        <section className={css.controls} aria-label="Choose location and date">
          <div className={css.filters}>
            <label>
              Location
              <select
                aria-label="Location"
                value={siteId}
                onChange={(e) => {
                  const next = data.locations.find((s) => s.id === e.target.value);
                  if (next) {
                    setLocation(normalizeLocation(next.name));
                    setNotice("");
                    setVisitor(false);
                  }
                }}
              >
                {!site && <option value="">Choose location</option>}
                {data.locations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {siteLabel(s.name)}
                  </option>
                ))}
              </select>
            </label>
            <div className={css.weekNav}>
              <button aria-label="Previous week" onClick={() => changeDate(addIsoDays(date, -7))}>
                <ChevronLeft size={19} />
              </button>
              <div>
                <span>Week of</span>
                <strong>{displayDate(week, { month: "long", day: "numeric", year: "numeric" })}</strong>
              </div>
              <button aria-label="Next week" onClick={() => changeDate(addIsoDays(date, 7))}>
                <ChevronRight size={19} />
              </button>
            </div>
            <label>
              Date
              <input type="date" value={date} onChange={(e) => changeDate(e.target.value)} />
            </label>
          </div>
          <div className={css.dayStrip} aria-label="Days of the week">
            {days.map((d) => (
              <button type="button" key={d} aria-pressed={d === date} onClick={() => changeDate(d)}>
                <span>{displayDate(d, { weekday: "short" })}</span>
                <strong>{Number(d.slice(-2))}</strong>
              </button>
            ))}
          </div>
        </section>
        {notice && (
          <p role="status" className={css.success}>
            {notice}
          </p>
        )}
        {error ? (
          <div role="alert" className={css.error}>
            Could not load this plan. {error}{" "}
            <button
              onClick={() => {
                void planner.reload();
                regularLoad.retry();
              }}
            >
              Retry
            </button>
          </div>
        ) : !ready ? (
          <p role="status">Loading schedules…</p>
        ) : !site ? (
          <p>No active care location is available for your account.</p>
        ) : (
          <>
            <div className={css.notes}>
              <div>
                <strong>{siteLabel(site.name)}</strong>
                <span>{displayDate(date, { weekday: "long", month: "long", day: "numeric" })}</span>
              </div>
              <div>
                <span>No school</span>
                <b>{notes?.no_school || "—"}</b>
              </div>
              <div>
                <span>Minimum day</span>
                <b>{notes?.minimum_day || "—"}</b>
              </div>
              {canEdit && (
                <button className={css.secondary} onClick={() => setEditNotes(true)}>
                  <Pencil size={15} /> School notes
                </button>
              )}
            </div>
            {isClosed && (
              <p className={css.warning}>
                Closed for care on this date. Scheduled blocks at this site are excluded from the counts.
              </p>
            )}
            <a className={css.jump} href="#daily-ratio-preview">
              View daily ratio ↓
            </a>
            <div className={css.columns}>
              <section className={css.panel}>
                <div className={css.panelHead}>
                  <div>
                    <h2>Contracted times</h2>
                    <p>
                      {scheduled.length} scheduled · {pending.length} awaiting · {noCare.length} No Care
                    </p>
                  </div>
                  {canEdit && visitors.length > 0 && (
                    <button className={css.secondary} onClick={() => setVisitor(!visitor)}>
                      Add visiting child
                    </button>
                  )}
                </div>
                {visitor && (
                  <label className={css.visitor}>
                    Child from another site
                    <select
                      value=""
                      onChange={(e) => {
                        const r = visitors.find((r) => r.child.id === e.target.value);
                        if (r) {
                          setEditing(r);
                          setVisitor(false);
                        }
                      }}
                    >
                      <option value="">Choose a child…</option>
                      {visitors.map((r) => (
                        <option key={r.child.id} value={r.child.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className={css.search}>
                  <Search size={17} />
                  <input
                    aria-label="Search children"
                    placeholder="Find a child"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                {groups.map((group) => {
                  const matches = group.items.filter((r) =>
                    r.name.toLowerCase().includes(search.trim().toLowerCase()),
                  );
                  if (!matches.length) return null;
                  return (
                    <section key={group.title} className={css.group}>
                      <h3>
                        {group.title} <span>{matches.length}</span>
                      </h3>
                      {matches.map((row) => (
                        <div key={row.child.id} className={css.row}>
                          <div>
                            <div className={css.name}>
                              <strong translate="no">{row.name}</strong>
                              {row.child.age_group?.toLowerCase() === "infant" && <small>Infant</small>}
                            </div>
                            {row.blocks.length > 0 && (
                              <p>
                                {row.blocks.map((b, i) => (
                                  <span key={i} className={b.locationId === siteId ? css.here : css.away}>
                                    {blockTime(b.start, b.end)}
                                    {(b.locationId !== siteId ||
                                      row.blocks.some((other) => other.locationId !== siteId)) &&
                                      ` · ${siteLabel(data.locations.find((s) => s.id === b.locationId)?.name || "Other site")}`}
                                  </span>
                                ))}
                              </p>
                            )}
                            {row.note && (
                              <p className={css.rowNote} translate="no">
                                {row.note}
                              </p>
                            )}
                            {(row.source === "Usual hours" || row.source === "Family approved") && (
                              <small>{row.source}</small>
                            )}
                          </div>
                          {canEdit && (
                            <button
                              className={css.edit}
                              aria-label={`Edit schedule for ${row.name}`}
                              onClick={() => setEditing(row)}
                            >
                              {row.status === "pending" ? "Enter hours" : "Edit"}
                            </button>
                          )}
                        </div>
                      ))}
                    </section>
                  );
                })}
                {!siteRows.some((r) => r.name.toLowerCase().includes(search.trim().toLowerCase())) && (
                  <p className={css.empty}>
                    {search ? "No matching children." : "No children assigned to this site for this date."}
                  </p>
                )}
              </section>
              <section id="daily-ratio-preview" className={css.panel} aria-label="Daily ratio preview">
                <div className={css.peak}>
                  <div>
                    <UsersRound size={19} />
                    <span>Peak scheduled</span>
                  </div>
                  <strong>{awaiting ? "—" : ratio.max}</strong>
                  <p>
                    {isClosed
                      ? "Site closed"
                      : awaiting
                        ? "Awaiting schedules"
                        : ratio.peakStart !== undefined && ratio.peakEnd !== undefined
                          ? `${compactTime(ratio.peakStart)}–${compactTime(ratio.peakEnd)}`
                          : "No care hours entered"}
                  </p>
                </div>
                <div className={css.ratioIntro}>
                  <h2>Daily ratio preview</h2>
                  <p>
                    {partial
                      ? `Partial counts · ${pending.length} schedule${pending.length === 1 ? "" : "s"} pending.`
                      : "Based on scheduled care."}{" "}
                    Max is the most children present at once.
                  </p>
                </div>
                <div className={css.ratioTable}>
                  <div className={css.tableHead}>
                    <span>Time block / children</span>
                    <span>Max</span>
                  </div>
                  {ratio.windows.map((w) => (
                    <div key={w.start} className={css.timeRow}>
                      <div>
                        <b>
                          {compactTime(w.start)}–{compactTime(w.end)}
                        </b>
                        <p>
                          {w.children.length
                            ? w.children
                                .map(
                                  (r) =>
                                    r.name + (r.child.age_group?.toLowerCase() === "infant" ? " (infant)" : ""),
                                )
                                .join(", ")
                            : "—"}
                        </p>
                      </div>
                      <strong>{awaiting ? "—" : w.count}</strong>
                    </div>
                  ))}
                </div>
                <Link className={css.ratioLink} href={planLink}>
                  <Clock3 size={16} /> Open full Ratio Plan <ChevronRight size={16} />
                </Link>
              </section>
            </div>
          </>
        )}
        {editing && site && (
          <ChildPlanEditor
            row={editing}
            rows={rows}
            data={data}
            date={date}
            siteId={siteId}
            onClose={() => setEditing(null)}
            onSaved={saved}
            refresh={planner.reload}
          />
        )}
        {editNotes && site && (
          <SchoolNotesEditor
            data={data}
            date={date}
            siteId={siteId}
            onClose={() => setEditNotes(false)}
            refresh={planner.reload}
            onSaved={saved}
          />
        )}
      </div>
    </MainLayout>
  );
}
