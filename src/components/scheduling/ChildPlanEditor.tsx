"use client";

import { useState } from "react";
import { Modal, PrimaryButton, SecondaryButton, inputClass } from "@/components/hub/HubUI";
import { useAuth } from "@/components/providers/AuthProvider";
import { displayDate, mondayOfWeek, weekDates } from "@/lib/family-care-calendar";
import { hubRequest } from "@/lib/hub-request";
import {
  buildDailyRatio,
  validatePlanBlocks,
  type DayRow,
  type PlanBlock,
  type PlanStatus,
  type PlannerData,
} from "@/lib/weekly-care-planner";
import { locationOptionLabel, normalizeLocation } from "@/lib/location-config";
import { Plus, Trash2 } from "lucide-react";

export function siteLabel(name: string) {
  const key = normalizeLocation(name);
  return key === "Division"
    ? "The School Age Center"
    : key === "All Locations"
      ? name
      : locationOptionLabel(key);
}

const fieldLabel = "mb-1 block text-sm font-bold text-slate-700";
const choice = "min-h-11 rounded-xl border px-3 text-sm font-bold";
const selected = "border-emerald-700 bg-emerald-700 text-white";
const unselected = "border-slate-300 bg-white text-slate-800";
const statusOptions: [PlanStatus, string][] = [
  ["scheduled", "Scheduled"],
  ["no-care", "No Care"],
  ["pending", "Awaiting schedule"],
];

export function ChildPlanEditor({
  row,
  rows,
  data,
  date,
  siteId,
  onClose,
  onSaved,
  refresh,
}: {
  row: DayRow;
  rows: DayRow[];
  data: PlannerData;
  date: string;
  siteId: string;
  onClose: () => void;
  onSaved: (message: string) => void;
  refresh: () => Promise<boolean>;
}) {
  const { session } = useAuth();
  const [status, setStatus] = useState<PlanStatus>(row.status === "pending" ? "scheduled" : row.status);
  const blank = (locationId = siteId): PlanBlock => ({ start: "", end: "", locationId });
  const [blocks, setBlocks] = useState<PlanBlock[]>(row.blocks.length ? row.blocks : [blank()]);
  const [note, setNote] = useState(row.note);
  const [dates, setDates] = useState([date]);
  const [versions] = useState(
    () =>
      new Map(
        data.overrides.filter((o) => o.child_id === row.child.id).map((o) => [o.service_date, o.updated_at]),
      ),
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const week = weekDates(mondayOfWeek(date));
  const invalid = status === "scheduled" ? validatePlanBlocks(blocks) : "";
  const localSite = data.locations.find((s) => s.id === siteId);
  const preview = invalid
    ? null
    : buildDailyRatio(
        rows.map((r) =>
          r.child.id === row.child.id ? { ...r, status, blocks: status === "scheduled" ? blocks : [] } : r,
        ),
        siteId,
        data.closures.some((c) => c.closure_date === date && (!c.location_id || c.location_id === siteId)),
      );
  function update(index: number, patch: Partial<PlanBlock>) {
    setBlocks((current) => current.map((b, i) => (i === index ? { ...b, ...patch } : b)));
    setError("");
  }
  async function save() {
    if (invalid || !session) {
      setError(invalid || "Sign in to save this schedule.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await hubRequest("/api/child-schedule-planner", session.access_token, {
        method: "POST",
        body: JSON.stringify({
          kind: "days",
          childId: row.child.id,
          dates: dates.map((d) => ({ date: d, version: versions.get(d) ?? null })),
          status,
          blocks: status === "scheduled" ? blocks : [],
          note,
        }),
      });
      const loaded = await refresh();
      onSaved(
        loaded
          ? `Saved ${row.name} for ${dates.map((d) => displayDate(d, { weekday: "short", month: "short", day: "numeric" })).join(", ")}.`
          : "Schedule saved. Refresh to see the updated plan.",
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the schedule.");
      setSaving(false);
      void refresh();
    }
  }
  return (
    <Modal
      title={row.name}
      description={displayDate(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
      onClose={() => {
        if (!saving) onClose();
      }}
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={saving}>
            Cancel
          </SecondaryButton>
          <PrimaryButton disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : dates.length > 1 ? `Save ${dates.length} days` : "Save day"}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-5">
        <fieldset>
          <legend className={fieldLabel}>Care for this day</legend>
          <div className="flex flex-wrap gap-2">
            {statusOptions.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={status === value}
                className={`${choice} ${status === value ? selected : unselected}`}
                onClick={() => {
                  setStatus(value);
                  setError("");
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        {status === "scheduled" && (
          <div className="space-y-3">
            {blocks.map((block, i) => (
              <fieldset key={i} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <legend className="px-1 text-sm font-bold">Care block {i + 1}</legend>
                <div className="grid grid-cols-2 gap-2">
                  <label>
                    <span className={fieldLabel}>Arrival</span>
                    <input
                      className={inputClass}
                      type="time"
                      value={block.start}
                      onChange={(e) => update(i, { start: e.target.value })}
                    />
                  </label>
                  <label>
                    <span className={fieldLabel}>Pickup</span>
                    <input
                      className={inputClass}
                      type="time"
                      value={block.end === "24:00" ? "00:00" : block.end}
                      onChange={(e) =>
                        update(i, { end: e.target.value === "00:00" ? "24:00" : e.target.value })
                      }
                    />
                  </label>
                </div>
                <div className="mt-2 flex items-end gap-2">
                  <label className="min-w-0 flex-1">
                    <span className={fieldLabel}>Care location</span>
                    <select
                      aria-label="Care location"
                      className={inputClass}
                      value={block.locationId}
                      onChange={(e) => update(i, { locationId: e.target.value })}
                    >
                      {data.locations.map((s) => (
                        <option key={s.id} value={s.id}>
                          {siteLabel(s.name)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {blocks.length > 1 && (
                    <button
                      type="button"
                      className={`${choice} border-slate-300 bg-white text-red-700`}
                      aria-label={`Remove block ${i + 1}`}
                      onClick={() => setBlocks(blocks.filter((_, n) => n !== i))}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </fieldset>
            ))}
            <SecondaryButton onClick={() => setBlocks([...blocks, blank(blocks.at(-1)?.locationId)])}>
              <Plus size={16} /> Add care block
            </SecondaryButton>
            {blocks.some((b) => b.end === "24:00" || (b.end && b.start && b.end < b.start)) && (
              <p className="text-sm text-slate-600">
                For overnight care, enter pickup at midnight and add the remaining hours on the next date.
              </p>
            )}
          </div>
        )}
        <label className="block">
          <span className={fieldLabel}>Schedule note</span>
          <input
            maxLength={500}
            className={inputClass}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional, e.g. early dismissal"
          />
        </label>
        <fieldset>
          <legend className={fieldLabel}>Apply this entry to</legend>
          <div className="flex flex-wrap gap-1">
            {week.map((d) => (
              <button
                key={d}
                aria-label={displayDate(d, { weekday: "long", month: "long", day: "numeric" })}
                aria-pressed={dates.includes(d)}
                disabled={d === date}
                className={`${choice} ${dates.includes(d) ? selected : unselected}`}
                onClick={() =>
                  setDates(dates.includes(d) ? dates.filter((x) => x !== d) : [...dates, d].sort())
                }
              >
                {displayDate(d, { weekday: "short" })} {Number(d.slice(-2))}
              </button>
            ))}
          </div>
          <div className="mt-1 flex flex-wrap gap-4 text-sm font-bold text-emerald-800">
            <button
              className="min-h-10"
              onClick={() => setDates([...new Set([...week.slice(0, 5), date])].sort())}
            >
              Select weekdays
            </button>
            <button className="min-h-10" onClick={() => setDates(week)}>
              Select all week
            </button>
            <button className="min-h-10" onClick={() => setDates([date])}>
              This date only
            </button>
          </div>
          {dates.length > 1 && (
            <p className="text-sm text-slate-600">
              This replaces this child’s hours and note on the {dates.length} selected dates.
            </p>
          )}
        </fieldset>
        {preview && localSite && (
          <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950">
            {siteLabel(localSite.name)} daily peak with this entry: <strong>{preview.max} scheduled</strong>
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-900">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

export function SchoolNotesEditor({
  data,
  date,
  siteId,
  onClose,
  refresh,
  onSaved,
}: {
  data: PlannerData;
  date: string;
  siteId: string;
  onClose: () => void;
  refresh: () => Promise<boolean>;
  onSaved: (text: string) => void;
}) {
  const { session } = useAuth();
  const [original] = useState(() =>
    data.schools.find((n) => n.location_id === siteId && n.service_date === date),
  );
  const [noSchool, setNoSchool] = useState(original?.no_school ?? "");
  const [minimumDay, setMinimumDay] = useState(original?.minimum_day ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!session) return;
    setSaving(true);
    try {
      await hubRequest("/api/child-schedule-planner", session.access_token, {
        method: "POST",
        body: JSON.stringify({
          kind: "school-notes",
          locationId: siteId,
          date,
          noSchool,
          minimumDay,
          version: original?.updated_at ?? null,
        }),
      });
      await refresh();
      onSaved("School notes saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save school notes.");
      setSaving(false);
      void refresh();
    }
  }
  return (
    <Modal
      title="School notes"
      description={displayDate(date, { weekday: "long", month: "long", day: "numeric" })}
      onClose={() => {
        if (!saving) onClose();
      }}
      footer={
        <>
          <SecondaryButton disabled={saving} onClick={onClose}>
            Cancel
          </SecondaryButton>
          <PrimaryButton disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save notes"}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className={fieldLabel}>No school</span>
          <input
            className={inputClass}
            maxLength={160}
            placeholder="School or district"
            value={noSchool}
            onChange={(e) => setNoSchool(e.target.value)}
          />
        </label>
        <label className="block">
          <span className={fieldLabel}>Minimum day</span>
          <input
            className={inputClass}
            maxLength={160}
            placeholder="School or district"
            value={minimumDay}
            onChange={(e) => setMinimumDay(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-800">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
