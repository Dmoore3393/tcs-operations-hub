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
function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
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

export async function GET(request: Request) {
  try {
    const { admin, user, profile, isOwner, isLicensee } = await requireStaff(request);
    const url = new URL(request.url);
    const requestedDays = Number(url.searchParams.get("days") || 14);
    const days = Math.max(1, Math.min(isOwner || isLicensee ? requestedDays : 14, 60));
    const since = new Date(Date.now() - days * 86400000).toISOString();

    let query = admin
      .from("audit_log")
      .select("id,organization_id,location_id,actor_user_id,metadata,occurred_at")
      .eq("organization_id", profile.organization_id)
      .eq("table_name", "time_clock")
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: true });

    if (!isOwner && !isLicensee) query = query.eq("actor_user_id", user.id);

    const [eventsResult, staffResult, locationResult] = await Promise.all([
      query,
      admin.from("staff_access").select("user_id,full_name,email,role,locations").eq("organization_id", profile.organization_id).eq("is_active", true),
      admin.from("locations").select("id,slug,name,full_name").eq("organization_id", profile.organization_id),
    ]);
    if (eventsResult.error) throw eventsResult.error;
    if (staffResult.error) throw staffResult.error;
    if (locationResult.error) throw locationResult.error;

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
      today: pacificDate(),
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

    const recent = await admin
      .from("audit_log")
      .select("metadata,occurred_at")
      .eq("organization_id", profile.organization_id)
      .eq("table_name", "time_clock")
      .eq("actor_user_id", user.id)
      .order("occurred_at", { ascending: false })
      .limit(20);
    if (recent.error) throw recent.error;

    const today = pacificDate();
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

    const occurredAt = new Date();
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
      },
    });
    if (error) throw error;

    if (event === "clock_in" || event === "clock_out") {
      const settings = await admin
        .from("staff_attendance_settings")
        .select("late_tracking_enabled,late_grace_minutes,early_departure_tracking_enabled,early_departure_grace_minutes")
        .eq("organization_id", profile.organization_id)
        .maybeSingle();
      if (settings.error) throw settings.error;

      const shifts = await admin
        .from("staff_shifts")
        .select("id,start_time,end_time,status")
        .eq("organization_id", profile.organization_id)
        .eq("user_id", user.id)
        .eq("location_id", location.id)
        .eq("shift_date", today)
        .neq("status", "Cancelled")
        .order("start_time", { ascending: true });
      if (shifts.error) throw shifts.error;

      const shiftRows = shifts.data ?? [];
      const nowMinutes = pacificClockMinutes(occurredAt);
      const shift = event === "clock_in" ? shiftRows[0] : shiftRows.at(-1);
      const lateGrace = Number(settings.data?.late_grace_minutes ?? 0);
      const earlyGrace = Number(settings.data?.early_departure_grace_minutes ?? 0);
      const scheduledMinutes = shift
        ? event === "clock_in"
          ? minutesFromTime(String(shift.start_time))
          : minutesFromTime(String(shift.end_time))
        : null;

      const shouldFlagLate = Boolean(
        shift &&
        event === "clock_in" &&
        settings.data?.late_tracking_enabled &&
        settings.data?.late_grace_minutes !== null &&
        scheduledMinutes !== null &&
        nowMinutes > scheduledMinutes + lateGrace
      );
      const shouldFlagEarly = Boolean(
        shift &&
        event === "clock_out" &&
        settings.data?.early_departure_tracking_enabled &&
        settings.data?.early_departure_grace_minutes !== null &&
        scheduledMinutes !== null &&
        nowMinutes < scheduledMinutes - earlyGrace
      );

      if (shift && (shouldFlagLate || shouldFlagEarly)) {
        const typeCode = shouldFlagLate ? "late_arrival" : "early_departure";
        const eventType = await admin
          .from("staff_performance_event_types")
          .select("id")
          .eq("organization_id", profile.organization_id)
          .eq("code", typeCode)
          .eq("is_active", true)
          .maybeSingle();
        if (eventType.error) throw eventType.error;

        if (eventType.data?.id) {
          const sourceReference = `${typeCode}:${shift.id}:${today}`;
          const existingFlag = await admin
            .from("staff_performance_events")
            .select("id")
            .eq("organization_id", profile.organization_id)
            .eq("staff_user_id", user.id)
            .eq("source_system", "Time Clock")
            .eq("source_reference", sourceReference)
            .maybeSingle();
          if (existingFlag.error) throw existingFlag.error;

          if (!existingFlag.data) {
            const difference = Math.abs(nowMinutes - (scheduledMinutes ?? nowMinutes));
            const summary = shouldFlagLate
              ? `Possible late arrival: clocked in ${difference} minute${difference === 1 ? "" : "s"} after the scheduled start.`
              : `Possible early departure: clocked out ${difference} minute${difference === 1 ? "" : "s"} before the scheduled end.`;
            const flagResult = await admin.from("staff_performance_events").insert({
              organization_id: profile.organization_id,
              staff_user_id: user.id,
              location_id: location.id,
              event_type_id: eventType.data.id,
              event_date: today,
              summary,
              notes: "Created automatically from the Hub Time Clock and staff schedule. Leadership review is required before confirmation.",
              recognition_points: 0,
              status: "Pending Review",
              source_system: "Time Clock",
              source_reference: sourceReference,
              created_by: user.id,
            });
            if (flagResult.error) throw flagResult.error;
          }
        }
      }
    }

    return Response.json({
      ok: true,
      event,
      occurredAt: occurredAt.toISOString(),
      location: requested,
    });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
