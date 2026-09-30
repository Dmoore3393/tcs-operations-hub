import {
  addIsoDays,
  deadlineForWeek,
  defaultCareCalendarSettings,
  displayDate,
  firstUpcomingWeek,
  lateDurationLabel,
  minutesLate,
  timeLabel,
  weekDates,
  type CareCalendarSettings,
} from "@/lib/family-care-calendar";
import { parentErrorResponse, requireParent } from "@/lib/server/require-parent";
import type { SupabaseClient } from "@supabase/supabase-js";

type DbRow = Record<string, unknown>;

function object(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DbRow : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isMissingTable(error: unknown) {
  const row = object(error);
  return text(row.code) === "42P01" || text(row.message).toLowerCase().includes("does not exist");
}

async function settingsForOrganization(admin: SupabaseClient, organizationId: string): Promise<CareCalendarSettings> {
  const { data, error } = await admin
    .from("family_schedule_settings")
    .select("submission_weeks_ahead,deadline_time,late_grace_hours,time_zone")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return defaultCareCalendarSettings;

  const row = data as unknown as DbRow;
  return {
    weeksAhead: Math.max(1, numberValue(row.submission_weeks_ahead, defaultCareCalendarSettings.weeksAhead)),
    deadlineTime: text(row.deadline_time).slice(0, 5) || defaultCareCalendarSettings.deadlineTime,
    lateGraceHours: Math.max(0, numberValue(row.late_grace_hours, defaultCareCalendarSettings.lateGraceHours)),
    timeZone: text(row.time_zone) || defaultCareCalendarSettings.timeZone,
  };
}

function scheduleDays(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const row = object(entry);
    return {
      date: text(row.date),
      noCare: row.noCare === true,
      startTime: text(row.startTime).slice(0, 5),
      endTime: text(row.endTime).slice(0, 5),
      note: text(row.note).slice(0, 500),
    };
  });
}

export async function GET(request: Request) {
  try {
    const { admin, children } = await requireParent(request);
    const schedulable = children.filter((child) =>
      child.access.permissions.viewSchedule || child.access.permissions.submitSchedule,
    );
    if (!schedulable.length) {
      throw new Response("Your Parent Portal account does not include schedule access.", { status: 403 });
    }

    const organizationId = schedulable[0].organizationId;
    const settings = await settingsForOrganization(admin, organizationId);
    const now = new Date();
    const firstWeek = firstUpcomingWeek(now, settings.timeZone);
    const weeks = Array.from({ length: settings.weeksAhead }, (_, index) => {
      const weekOf = addIsoDays(firstWeek, index * 7);
      const deadline = deadlineForWeek(weekOf, settings.deadlineTime, settings.timeZone);
      const lateBy = minutesLate(now, deadline);
      const cutoff = new Date(deadline.getTime() + settings.lateGraceHours * 60 * 60 * 1000);
      return {
        weekOf,
        dates: weekDates(weekOf),
        deadlineAt: deadline.toISOString(),
        deadlineLabel: `Friday ${displayDate(addIsoDays(weekOf, -3), { month: "short", day: "numeric" })} at ${timeLabel(settings.deadlineTime)}`,
        lateByMinutes: lateBy,
        lateLabel: lateBy > 0 ? lateDurationLabel(lateBy) : "",
        canSubmit: now.getTime() <= cutoff.getTime(),
      };
    });

    const startDate = weeks[0]?.dates[0] ?? firstWeek;
    const endDate = weeks.at(-1)?.dates.at(-1) ?? addIsoDays(firstWeek, 55);
    const rowIds = schedulable.map((child) => child.rowId);
    const locationIds = [...new Set(schedulable.map((child) => child.locationId).filter(Boolean))];

    const [closureResult, submissionResult, locationResult] = await Promise.all([
      admin
        .from("care_calendar_closures")
        .select("id,location_id,closure_date,title,note")
        .eq("organization_id", organizationId)
        .gte("closure_date", startDate)
        .lte("closure_date", endDate)
        .order("closure_date"),
      admin
        .from("family_schedule_submissions")
        .select("id,child_id,child_legacy_id,week_of,request_kind,status,schedule_data,submitted_at,deadline_at,late_by_minutes,reviewed_at,review_note")
        .eq("organization_id", organizationId)
        .in("child_id", rowIds)
        .gte("week_of", firstWeek)
        .order("submitted_at", { ascending: false }),
      locationIds.length
        ? admin.from("locations").select("id,name,full_name").in("id", locationIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const failure = closureResult.error || submissionResult.error || locationResult.error;
    if (failure) throw failure;

    const locationNames = new Map(
      ((locationResult.data ?? []) as unknown as DbRow[])
        .map((row) => [text(row.id), text(row.name) || text(row.full_name)]),
    );

    return Response.json({
      settings,
      weeks,
      children: schedulable.map((child) => {
        const record = child.record;
        return {
          id: child.legacyId,
          rowId: child.rowId,
          firstName: text(record.firstName),
          lastName: text(record.lastName),
          locationId: child.locationId,
          location: locationNames.get(child.locationId) || text(record.location),
          canSubmit: child.access.permissions.submitSchedule,
        };
      }),
      closures: ((closureResult.data ?? []) as unknown as DbRow[]).map((row) => ({
        id: text(row.id),
        locationId: text(row.location_id),
        date: text(row.closure_date),
        title: text(row.title) || "TCS Closed",
        note: text(row.note),
      })),
      submissions: ((submissionResult.data ?? []) as unknown as DbRow[]).map((row) => ({
        id: text(row.id),
        childId: text(row.child_legacy_id),
        weekOf: text(row.week_of),
        requestKind: text(row.request_kind),
        status: text(row.status),
        schedule: scheduleDays(row.schedule_data),
        submittedAt: text(row.submitted_at),
        deadlineAt: text(row.deadline_at),
        lateByMinutes: numberValue(row.late_by_minutes, 0),
        reviewedAt: text(row.reviewed_at),
        reviewNote: text(row.review_note),
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isMissingTable(error)) {
      return Response.json({ error: "The Family Care Calendar is being activated. Please try again after TCS finishes setup." }, { status: 503 });
    }
    return parentErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { admin, user, email, children } = await requireParent(request);
    const body = object(await request.json().catch(() => ({})));
    const childLegacyId = text(body.childId);
    const weekOf = text(body.weekOf);
    const days = scheduleDays(body.days);

    const child = children.find((entry) => entry.legacyId === childLegacyId);
    if (!child) throw new Response("That child is not linked to your Parent Portal account.", { status: 404 });
    if (!child.access.permissions.submitSchedule) {
      throw new Response("Your account can view this schedule but cannot submit schedule requests.", { status: 403 });
    }

    const settings = await settingsForOrganization(admin, child.organizationId);
    const now = new Date();
    const firstWeek = firstUpcomingWeek(now, settings.timeZone);
    const allowedWeeks = new Set(Array.from({ length: settings.weeksAhead }, (_, index) => addIsoDays(firstWeek, index * 7)));
    if (!allowedWeeks.has(weekOf)) {
      throw new Response(`Choose one of the next ${settings.weeksAhead} care weeks shown in the calendar.`, { status: 400 });
    }

    const expectedDates = weekDates(weekOf);
    const expectedSet = new Set(expectedDates);
    if (days.length !== 7 || days.some((day) => !expectedSet.has(day.date))) {
      throw new Response("Submit one entry for each day in the selected care week.", { status: 400 });
    }

    for (const day of days) {
      if (day.noCare) continue;
      if (!/^\d{2}:\d{2}$/.test(day.startTime) || !/^\d{2}:\d{2}$/.test(day.endTime) || day.endTime <= day.startTime) {
        throw new Response(`Enter a valid drop-off and pick-up time for ${displayDate(day.date, { weekday: "long", month: "short", day: "numeric" })}.`, { status: 400 });
      }
    }

    const deadline = deadlineForWeek(weekOf, settings.deadlineTime, settings.timeZone);
    const lateBy = minutesLate(now, deadline);
    const graceMinutes = settings.lateGraceHours * 60;
    if (lateBy > graceMinutes) {
      throw new Response(
        `The app's late-request window has closed for this week. The schedule was due Friday at ${timeLabel(settings.deadlineTime)}. Please contact your TCS location directly.`,
        { status: 409 },
      );
    }

    const careDates = days.filter((day) => !day.noCare).map((day) => day.date);
    if (careDates.length) {
      const closureResult = await admin
        .from("care_calendar_closures")
        .select("closure_date,location_id,title")
        .eq("organization_id", child.organizationId)
        .in("closure_date", careDates);

      if (closureResult.error) throw closureResult.error;
      const blocked = ((closureResult.data ?? []) as unknown as DbRow[]).find((row) => {
        const locationId = text(row.location_id);
        return !locationId || locationId === child.locationId;
      });
      if (blocked) {
        throw new Response(
          `${displayDate(text(blocked.closure_date), { weekday: "long", month: "short", day: "numeric" })} is blocked on the TCS calendar (${text(blocked.title) || "TCS Closed"}). Remove care from that date before submitting.`,
          { status: 409 },
        );
      }
    }

    const priorResult = await admin
      .from("family_schedule_submissions")
      .select("id,status")
      .eq("organization_id", child.organizationId)
      .eq("child_id", child.rowId)
      .eq("week_of", weekOf)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (priorResult.error) throw priorResult.error;
    const prior = priorResult.data as unknown as DbRow | null;
    const requestKind = text(prior?.status) === "Approved" ? "Change" : "Initial";

    const supersedeResult = await admin
      .from("family_schedule_submissions")
      .update({ status: "Superseded" })
      .eq("organization_id", child.organizationId)
      .eq("child_id", child.rowId)
      .eq("week_of", weekOf)
      .in("status", ["Pending", "Needs Changes"]);

    if (supersedeResult.error) throw supersedeResult.error;

    const insertResult = await admin
      .from("family_schedule_submissions")
      .insert({
        organization_id: child.organizationId,
        location_id: child.locationId,
        child_id: child.rowId,
        child_legacy_id: child.legacyId,
        week_of: weekOf,
        request_kind: requestKind,
        status: "Pending",
        schedule_data: days,
        submitted_by: user.id,
        submitted_by_email: email,
        submitted_at: now.toISOString(),
        deadline_at: deadline.toISOString(),
        late_by_minutes: lateBy,
      })
      .select("id,status,submitted_at")
      .single();

    if (insertResult.error) throw insertResult.error;

    await admin.from("audit_log").insert({
      organization_id: child.organizationId,
      location_id: child.locationId,
      actor_user_id: user.id,
      action: "INSERT",
      table_name: "family_schedule_submissions",
      row_id: insertResult.data.id,
      metadata: {
        kind: "family_schedule_submitted",
        childLegacyId: child.legacyId,
        weekOf,
        requestKind,
        lateByMinutes: lateBy,
      },
    });

    return Response.json({
      ok: true,
      id: insertResult.data.id,
      status: insertResult.data.status,
      submittedAt: insertResult.data.submitted_at,
      lateByMinutes: lateBy,
      warning: lateBy > 0
        ? `We received this schedule ${lateDurationLabel(lateBy)}. Because it was submitted after Friday at ${timeLabel(settings.deadlineTime)}, care is not guaranteed until TCS confirms space and staffing.`
        : "",
      message: requestKind === "Change"
        ? "Your schedule change request was sent to TCS for approval."
        : "Your weekly care schedule was sent to TCS for approval.",
    });
  } catch (error) {
    if (isMissingTable(error)) {
      return Response.json({ error: "The Family Care Calendar is being activated. Please try again after TCS finishes setup." }, { status: 503 });
    }
    return parentErrorResponse(error);
  }
}
