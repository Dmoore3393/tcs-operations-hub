import { normalizeLocation, type LocationKey } from "@/lib/location-config";
import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";

type DbRow = Record<string, unknown>;
type ClockEventType = "clock_in" | "clock_out" | "break_start" | "break_end";

function object(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DbRow : {};
}
function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
function pacificDate(value: string | Date = new Date()) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
function requestedLocationAllowed(requested: LocationKey, assigned: string[], isOwner: boolean) {
  if (isOwner) return true;
  if (assigned.includes("All Locations")) return true;
  return assigned.some((item) => normalizeLocation(item) === requested);
}
function eventFromMetadata(metadata: unknown): ClockEventType | "" {
  const value = text(object(metadata).event);
  return ["clock_in", "clock_out", "break_start", "break_end"].includes(value) ? value as ClockEventType : "";
}
function transitionAllowed(last: ClockEventType | "", next: ClockEventType) {
  if (next === "clock_in") return !last || last === "clock_out";
  if (next === "break_start") return last === "clock_in" || last === "break_end";
  if (next === "break_end") return last === "break_start";
  return last === "clock_in" || last === "break_end";
}
function minutesFromTime(value: string) {
  const [hourText, minuteText] = value.slice(0, 5).split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : 0;
}
function clockLabel(minutes: number) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${suffix}`;
}
function pacificClockMinutes(value: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(value);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0) % 24;
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}
function exceptionCovers(
  row: DbRow,
  nowMinutes: number,
  shiftId: string | null,
  direction: "start" | "end" | "any",
) {
  if (text(row.status) !== "Approved") return false;
  const rowShiftId = text(row.shift_id);
  if (rowShiftId && shiftId && rowShiftId !== shiftId) return false;
  if (rowShiftId && !shiftId) return false;
  const start = text(row.approved_start_time) ? minutesFromTime(text(row.approved_start_time)) : null;
  const end = text(row.approved_end_time) ? minutesFromTime(text(row.approved_end_time)) : null;
  if (direction === "start") return start !== null && nowMinutes >= start && (end === null || nowMinutes <= end);
  if (direction === "end") return end !== null && nowMinutes <= end && (start === null || nowMinutes >= start);
  return (start === null || nowMinutes >= start) && (end === null || nowMinutes <= end);
}
function workedMinutes(events: DbRow[], currentLocationId: string, through: Date) {
  const rows = events
    .filter((row) => text(row.location_id) === currentLocationId)
    .map((row) => ({ event: eventFromMetadata(row.metadata), occurredAt: text(row.occurred_at) }))
    .filter((row) => row.event && row.occurredAt)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  let workingFrom: number | null = null;
  let breakFrom: number | null = null;
  let total = 0;
  let breaks = 0;
  for (const row of rows) {
    const stamp = new Date(row.occurredAt).getTime();
    if (!Number.isFinite(stamp)) continue;
    if (row.event === "clock_in") workingFrom = stamp;
    if (row.event === "break_start" && workingFrom !== null) breakFrom = stamp;
    if (row.event === "break_end" && breakFrom !== null) {
      breaks += Math.max(0, stamp - breakFrom);
      breakFrom = null;
    }
    if (row.event === "clock_out" && workingFrom !== null) {
      total += Math.max(0, stamp - workingFrom);
      workingFrom = null;
      breakFrom = null;
    }
  }
  if (workingFrom !== null) total += Math.max(0, through.getTime() - workingFrom);
  if (breakFrom !== null) breaks += Math.max(0, through.getTime() - breakFrom);
  return Math.max(0, Math.round((total - breaks) / 60000));
}
async function createPendingPerformanceEvent(args: {
  admin: Awaited<ReturnType<typeof requireStaff>>["admin"];
  organizationId: string;
  staffUserId: string;
  locationId: string;
  eventDate: string;
  typeCode: string;
  sourceReference: string;
  summary: string;
  notes: string;
  createdBy: string;
}) {
  const { admin, organizationId, staffUserId, locationId, eventDate, typeCode, sourceReference, summary, notes, createdBy } = args;
  const eventType = await admin
    .from("staff_performance_event_types")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("code", typeCode)
    .eq("is_active", true)
    .maybeSingle();
  if (eventType.error) throw eventType.error;
  if (!eventType.data?.id) return;

  const existing = await admin
    .from("staff_performance_events")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("staff_user_id", staffUserId)
    .eq("source_system", "Time Clock")
    .eq("source_reference", sourceReference)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return;

  const result = await admin.from("staff_performance_events").insert({
    organization_id: organizationId,
    staff_user_id: staffUserId,
    location_id: locationId,
    event_type_id: eventType.data.id,
    event_date: eventDate,
    summary,
    notes,
    recognition_points: 0,
    status: "Pending Review",
    source_system: "Time Clock",
    source_reference: sourceReference,
    created_by: createdBy,
  });
  if (result.error) throw result.error;
}

export async function GET(request: Request) {
  try {
    const { admin, user, profile, isOwner, isLicensee } = await requireStaff(request);
    const url = new URL(request.url);
    const requestedDays = Number(url.searchParams.get("days") || 14);
    const days = Math.max(1, Math.min(isOwner || isLicensee ? requestedDays : 14, 60));
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const today = pacificDate();

    let query = admin
      .from("audit_log")
      .select("id,organization_id,location_id,actor_user_id,metadata,occurred_at")
      .eq("organization_id", profile.organization_id)
      .eq("table_name", "time_clock")
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: true });

    if (!isOwner && !isLicensee) query = query.eq("actor_user_id", user.id);

    const [eventsResult, staffResult, locationResult, settingsResult, shiftResult, exceptionResult] = await Promise.all([
      query,
      admin.from("staff_access").select("user_id,full_name,email,role,locations").eq("organization_id", profile.organization_id).eq("is_active", true),
      admin.from("locations").select("id,slug,name,full_name").eq("organization_id", profile.organization_id),
      admin.from("staff_attendance_settings")
        .select("enforce_schedule_clocking,early_clock_in_window_minutes,late_clock_out_window_minutes,flag_scheduled_hours_overage")
        .eq("organization_id", profile.organization_id)
        .maybeSingle(),
      admin.from("staff_shifts")
        .select("id,location_id,user_id,shift_date,start_time,end_time,status,position_label")
        .eq("organization_id", profile.organization_id)
        .eq("user_id", user.id)
        .eq("shift_date", today)
        .eq("status", "Published")
        .order("start_time"),
      admin.from("staff_clock_exceptions")
        .select("id,location_id,shift_id,work_date,approval_scope,approved_start_time,approved_end_time,reason,status,approved_at")
        .eq("organization_id", profile.organization_id)
        .eq("staff_user_id", user.id)
        .eq("work_date", today)
        .eq("status", "Approved")
        .order("approved_at", { ascending: false }),
    ]);
    if (eventsResult.error) throw eventsResult.error;
    if (staffResult.error) throw staffResult.error;
    if (locationResult.error) throw locationResult.error;
    if (settingsResult.error) throw settingsResult.error;
    if (shiftResult.error) throw shiftResult.error;
    if (exceptionResult.error) throw exceptionResult.error;

    const staffMap = new Map((staffResult.data ?? []).map((row) => [String(row.user_id), row]));
    const locationMap = new Map((locationResult.data ?? []).map((row) => [String(row.id), row]));
    const allowedLocationKeys = new Set((profile.locations ?? []).map((item) => normalizeLocation(item)));

    const events = ((eventsResult.data ?? []) as unknown as DbRow[])
      .map((row) => {
        const actorId = text(row.actor_user_id);
        const locationId = text(row.location_id);
        const staff = staffMap.get(actorId) as DbRow | undefined;
        const location = locationMap.get(locationId) as DbRow | undefined;
        const locationKey = normalizeLocation(`${text(location?.slug)} ${text(location?.name)} ${text(location?.full_name)}`);
        return {
          id: String(row.id ?? ""),
          actorUserId: actorId,
          staffName: text(staff?.full_name) || text(staff?.email) || "TCS Staff",
          role: text(staff?.role),
          location: locationKey,
          event: eventFromMetadata(row.metadata),
          occurredAt: text(row.occurred_at),
        };
      })
      .filter((event) => event.event)
      .filter((event) => isOwner || (!isLicensee ? event.actorUserId === user.id : allowedLocationKeys.has(event.location)));

    return Response.json({
      events,
      currentUserId: user.id,
      today,
      clockPolicy: settingsResult.data ?? {
        enforce_schedule_clocking: true,
        early_clock_in_window_minutes: 4,
        late_clock_out_window_minutes: 4,
        flag_scheduled_hours_overage: true,
      },
      myPublishedShifts: (shiftResult.data ?? []).map((shift) => {
        const location = locationMap.get(String(shift.location_id)) as DbRow | undefined;
        return {
          ...shift,
          location: normalizeLocation(`${text(location?.slug)} ${text(location?.name)} ${text(location?.full_name)}`),
        };
      }),
      myApprovedExceptions: exceptionResult.data ?? [],
    }, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { admin, userClient, user, profile, isOwner } = await requireStaff(request);
    const body = object(await request.json().catch(() => ({})));
    const event = text(body.event) as ClockEventType;
    const requested = normalizeLocation(text(body.location));

    if (!["clock_in", "clock_out", "break_start", "break_end"].includes(event)) {
      throw new Response("Choose a valid time clock action.", { status: 400 });
    }
    if (requested === "All Locations") {
      throw new Response("Choose the location where you are working.", { status: 400 });
    }
    if (!requestedLocationAllowed(requested, profile.locations ?? [], isOwner)) {
      throw new Response("That location is outside this staff account's assignment.", { status: 403 });
    }

    const locations = await admin
      .from("locations")
      .select("id,slug,name,full_name")
      .eq("organization_id", profile.organization_id);
    if (locations.error) throw locations.error;
    const location = (locations.data ?? []).find((row) =>
      normalizeLocation(`${row.slug || ""} ${row.name || ""} ${row.full_name || ""}`) === requested,
    );
    if (!location) throw new Response("The selected work location was not found.", { status: 400 });

    const occurredAt = new Date();
    const today = pacificDate(occurredAt);
    const nowMinutes = pacificClockMinutes(occurredAt);

    const [recent, settingsResult, shiftsResult, exceptionsResult] = await Promise.all([
      admin
        .from("audit_log")
        .select("location_id,metadata,occurred_at")
        .eq("organization_id", profile.organization_id)
        .eq("table_name", "time_clock")
        .eq("actor_user_id", user.id)
        .order("occurred_at", { ascending: false })
        .limit(60),
      admin
        .from("staff_attendance_settings")
        .select("late_tracking_enabled,late_grace_minutes,early_departure_tracking_enabled,early_departure_grace_minutes,enforce_schedule_clocking,early_clock_in_window_minutes,late_clock_out_window_minutes,flag_scheduled_hours_overage")
        .eq("organization_id", profile.organization_id)
        .maybeSingle(),
      admin
        .from("staff_shifts")
        .select("id,start_time,end_time,status")
        .eq("organization_id", profile.organization_id)
        .eq("user_id", user.id)
        .eq("location_id", location.id)
        .eq("shift_date", today)
        .eq("status", "Published")
        .order("start_time", { ascending: true }),
      admin
        .from("staff_clock_exceptions")
        .select("id,shift_id,approved_start_time,approved_end_time,approval_scope,reason,status")
        .eq("organization_id", profile.organization_id)
        .eq("staff_user_id", user.id)
        .eq("location_id", location.id)
        .eq("work_date", today)
        .eq("status", "Approved"),
    ]);
    if (recent.error) throw recent.error;
    if (settingsResult.error) throw settingsResult.error;
    if (shiftsResult.error) throw shiftsResult.error;
    if (exceptionsResult.error) throw exceptionsResult.error;

    const todays = ((recent.data ?? []) as unknown as DbRow[])
      .filter((row) => pacificDate(text(row.occurred_at)) === today);
    const last = todays.length ? eventFromMetadata(todays[0].metadata) : "";

    if (!transitionAllowed(last, event)) {
      const labels: Record<string, string> = {
        clock_in: "clock in",
        clock_out: "clock out",
        break_start: "start a break",
        break_end: "end a break",
      };
      throw new Response(`You cannot ${labels[event]} after the current time-clock state. Refresh the page and review today’s last action.`, { status: 400 });
    }

    const settings = settingsResult.data ?? {};
    const shifts = (shiftsResult.data ?? []) as unknown as DbRow[];
    const exceptions = (exceptionsResult.data ?? []) as unknown as DbRow[];
    const earlyWindow = Math.max(0, Number(settings.early_clock_in_window_minutes ?? 4));
    const lateWindow = Math.max(0, Number(settings.late_clock_out_window_minutes ?? 4));
    const enforceSchedule = settings.enforce_schedule_clocking !== false;

    const relevantShift = shifts.find((shift) => nowMinutes <= minutesFromTime(text(shift.end_time)) + lateWindow) ?? shifts.at(-1) ?? null;
    const relevantShiftId = relevantShift ? text(relevantShift.id) : null;
    const approvedStart = exceptions.some((row) => exceptionCovers(row, nowMinutes, relevantShiftId, "start"));
    const approvedEnd = exceptions.some((row) => exceptionCovers(row, nowMinutes, relevantShiftId, "end"));
    const approvedAny = exceptions.some((row) => exceptionCovers(row, nowMinutes, relevantShiftId, "any"));

    if (event === "clock_in" && enforceSchedule && !isOwner) {
      if (!relevantShift) {
        if (!approvedAny) {
          throw new Response("You do not have a published shift at this location today. A shift exception must be approved before you can clock in.", { status: 409 });
        }
      } else {
        const startMinutes = minutesFromTime(text(relevantShift.start_time));
        const endMinutes = minutesFromTime(text(relevantShift.end_time));
        const earliestAllowed = startMinutes - earlyWindow;
        if (nowMinutes < earliestAllowed && !approvedStart) {
          throw new Response(`Your shift starts at ${clockLabel(startMinutes)}. You may clock in up to ${earlyWindow} minutes early, beginning at ${clockLabel(earliestAllowed)}. Earlier work requires an approved shift exception.`, { status: 409 });
        }
        if (nowMinutes > endMinutes + lateWindow && !approvedAny) {
          throw new Response("This shift has already ended. An approved shift exception is required before starting additional work.", { status: 409 });
        }
      }
    }

    const { error } = await userClient.rpc("record_audit_event", {
      p_action: "CREATE",
      p_table_name: "time_clock",
      p_row_id: null,
      p_location_id: location.id,
      p_metadata: {
        kind: "staff_time_clock",
        event,
        location: requested,
        clientTimestamp: text(body.clientTimestamp).slice(0, 40),
        scheduleExceptionApproved: approvedAny,
      },
    });
    if (error) throw error;

    let needsLeadershipReview = false;

    if ((event === "clock_in" || event === "clock_out") && relevantShift) {
      const shiftStart = minutesFromTime(text(relevantShift.start_time));
      const shiftEnd = minutesFromTime(text(relevantShift.end_time));
      const lateGrace = Number(settings.late_grace_minutes ?? 0);
      const earlyGrace = Number(settings.early_departure_grace_minutes ?? 0);

      const shouldFlagLate = Boolean(
        event === "clock_in" &&
        settings.late_tracking_enabled &&
        settings.late_grace_minutes !== null &&
        nowMinutes > shiftStart + lateGrace
      );
      const shouldFlagEarly = Boolean(
        event === "clock_out" &&
        settings.early_departure_tracking_enabled &&
        settings.early_departure_grace_minutes !== null &&
        nowMinutes < shiftEnd - earlyGrace
      );

      if (shouldFlagLate || shouldFlagEarly) {
        const typeCode = shouldFlagLate ? "late_arrival" : "early_departure";
        const difference = shouldFlagLate ? nowMinutes - shiftStart : shiftEnd - nowMinutes;
        await createPendingPerformanceEvent({
          admin,
          organizationId: profile.organization_id,
          staffUserId: user.id,
          locationId: String(location.id),
          eventDate: today,
          typeCode,
          sourceReference: `${typeCode}:${relevantShiftId}:${today}`,
          summary: shouldFlagLate
            ? `Possible late arrival: clocked in ${difference} minute${difference === 1 ? "" : "s"} after the scheduled start.`
            : `Possible early departure: clocked out ${difference} minute${difference === 1 ? "" : "s"} before the scheduled end.`,
          notes: "Created automatically from the Hub Time Clock and published staff schedule. Leadership review is required before confirmation.",
          createdBy: user.id,
        });
        needsLeadershipReview = true;
      }

      if (event === "clock_out" && settings.flag_scheduled_hours_overage !== false) {
        const currentLocationId = String(location.id);
        const actualWorked = workedMinutes(todays, currentLocationId, occurredAt);
        const scheduledWorked = shifts.reduce((sum, shift) => {
          const start = minutesFromTime(text(shift.start_time));
          const end = minutesFromTime(text(shift.end_time));
          return sum + Math.max(0, end - start);
        }, 0);
        const allowedClockWindowMinutes = earlyWindow + lateWindow;
        const overageBeyondWindow = actualWorked - (scheduledWorked + allowedClockWindowMinutes);
        const beyondClockWindow = nowMinutes > shiftEnd + lateWindow;

        if ((overageBeyondWindow > 0 || beyondClockWindow) && !approvedEnd && !approvedAny) {
          const amount = Math.max(overageBeyondWindow, Math.max(0, nowMinutes - (shiftEnd + lateWindow)));
          await createPendingPerformanceEvent({
            admin,
            organizationId: profile.organization_id,
            staffUserId: user.id,
            locationId: currentLocationId,
            eventDate: today,
            typeCode: "unapproved_shift_overage",
            sourceReference: `unapproved_shift_overage:${today}:${currentLocationId}`,
            summary: `Possible unapproved shift overage: ${amount} minute${amount === 1 ? "" : "s"} beyond the permitted clock window.`,
            notes: beyondClockWindow
              ? `Clock-out occurred more than ${lateWindow} minutes after the published shift end. Actual clock time was preserved. Leadership must verify whether the additional work was approved.`
              : `Total worked time exceeded the published scheduled duration plus the normal ${earlyWindow}-minute early and ${lateWindow}-minute late clock windows. Leadership must verify whether the additional work was approved.`,
            createdBy: user.id,
          });
          needsLeadershipReview = true;
        }
      }
    }

    return Response.json({
      ok: true,
      event,
      occurredAt: occurredAt.toISOString(),
      location: requested,
      needsLeadershipReview,
      policy: {
        earlyClockInWindowMinutes: earlyWindow,
        lateClockOutWindowMinutes: lateWindow,
      },
    });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
