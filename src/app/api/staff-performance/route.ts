import { normalizeLocation } from "@/lib/location-config";
import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";

export const runtime = "nodejs";

type JsonObject = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function dateText(value: unknown) {
  const next = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(next) ? next : "";
}

function numberValue(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

async function accessibleLocationIds(auth: Awaited<ReturnType<typeof requireStaff>>) {
  if (auth.isOwner) {
    const { data, error } = await auth.admin
      .from("locations")
      .select("id")
      .eq("organization_id", auth.profile.organization_id)
      .eq("is_active", true);
    if (error) throw error;
    return (data ?? []).map((row) => String(row.id));
  }

  if (!auth.isLicensee) throw new Response("Leadership access is required.", { status: 403 });

  const { data, error } = await auth.admin
    .from("staff_location_assignments")
    .select("location_id")
    .eq("organization_id", auth.profile.organization_id)
    .eq("user_id", auth.profile.user_id);
  if (error) throw error;
  return [...new Set((data ?? []).map((row) => String(row.location_id)))];
}

async function assertLocationAccess(auth: Awaited<ReturnType<typeof requireStaff>>, locationId: string) {
  const ids = await accessibleLocationIds(auth);
  if (!ids.includes(locationId)) throw new Response("You do not have access to that location.", { status: 403 });
}

async function assertStaffAtLocation(auth: Awaited<ReturnType<typeof requireStaff>>, staffUserId: string, locationId: string) {
  const { data, error } = await auth.admin
    .from("staff_location_assignments")
    .select("user_id")
    .eq("organization_id", auth.profile.organization_id)
    .eq("user_id", staffUserId)
    .eq("location_id", locationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Response("That employee is not assigned to the selected location.", { status: 400 });
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
function pacificMinutes(value: Date = new Date()) {
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
function timeMinutes(value: unknown) {
  const [hourText, minuteText] = text(value).slice(0, 5).split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : 0;
}
function auditClockEvent(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
  const value = text((metadata as Record<string, unknown>).event);
  return value;
}
async function syncPossibleNoShows(auth: Awaited<ReturnType<typeof requireStaff>>, visibleLocationIds: string[]) {
  if (!visibleLocationIds.length) return;

  const settings = await auth.admin
    .from("staff_attendance_settings")
    .select("no_show_tracking_enabled,no_show_after_minutes")
    .eq("organization_id", auth.profile.organization_id)
    .maybeSingle();
  if (settings.error) throw settings.error;
  if (!settings.data?.no_show_tracking_enabled || settings.data.no_show_after_minutes === null) return;

  const today = pacificDate();
  const threshold = Math.max(0, Number(settings.data.no_show_after_minutes || 0));
  const nowMinutes = pacificMinutes();

  const [shiftResult, clockResult, timeOffResult, eventTypeResult] = await Promise.all([
    auth.admin
      .from("staff_shifts")
      .select("id,user_id,location_id,start_time,end_time,status")
      .eq("organization_id", auth.profile.organization_id)
      .eq("shift_date", today)
      .eq("status", "Published")
      .in("location_id", visibleLocationIds),
    auth.admin
      .from("audit_log")
      .select("actor_user_id,location_id,metadata,occurred_at")
      .eq("organization_id", auth.profile.organization_id)
      .eq("table_name", "time_clock")
      .gte("occurred_at", new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString()),
    auth.admin
      .from("time_off_requests")
      .select("staff_user_id,location_id,request_scope,start_date,end_date,status")
      .eq("organization_id", auth.profile.organization_id)
      .eq("status", "Approved")
      .lte("start_date", today)
      .gte("end_date", today),
    auth.admin
      .from("staff_performance_event_types")
      .select("id")
      .eq("organization_id", auth.profile.organization_id)
      .eq("code", "no_call_no_show")
      .eq("is_active", true)
      .maybeSingle(),
  ]);
  const firstError = shiftResult.error || clockResult.error || timeOffResult.error || eventTypeResult.error;
  if (firstError) throw firstError;
  if (!eventTypeResult.data?.id) return;

  const clockedIn = new Set(
    (clockResult.data ?? [])
      .filter((row) => pacificDate(String(row.occurred_at)) === today)
      .filter((row) => auditClockEvent(row.metadata) === "clock_in")
      .map((row) => `${row.actor_user_id}:${row.location_id}`),
  );

  for (const shift of shiftResult.data ?? []) {
    if (!shift.user_id) continue;
    const scheduledStart = timeMinutes(shift.start_time);
    if (nowMinutes <= scheduledStart + threshold) continue;
    if (clockedIn.has(`${shift.user_id}:${shift.location_id}`)) continue;

    const hasApprovedTimeOff = (timeOffResult.data ?? []).some((request) =>
      String(request.staff_user_id) === String(shift.user_id)
      && (
        request.request_scope === "All Assigned Locations"
        || String(request.location_id || "") === String(shift.location_id)
      )
    );
    if (hasApprovedTimeOff) continue;

    const sourceReference = `no_show:${shift.id}:${today}`;
    const existing = await auth.admin
      .from("staff_performance_events")
      .select("id")
      .eq("organization_id", auth.profile.organization_id)
      .eq("staff_user_id", shift.user_id)
      .eq("source_system", "Attendance Automation")
      .eq("source_reference", sourceReference)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) continue;

    const minutesLate = Math.max(0, nowMinutes - scheduledStart);
    const created = await auth.admin.from("staff_performance_events").insert({
      organization_id: auth.profile.organization_id,
      staff_user_id: shift.user_id,
      location_id: shift.location_id,
      event_type_id: eventTypeResult.data.id,
      event_date: today,
      summary: `Possible no-call/no-show: no clock-in recorded ${minutesLate} minutes after the published shift start.`,
      notes: "Created automatically from the published staff schedule and Hub Time Clock. Leadership must verify whether the employee communicated before confirming this event.",
      recognition_points: 0,
      status: "Pending Review",
      source_system: "Attendance Automation",
      source_reference: sourceReference,
      created_by: auth.user.id,
    });
    if (created.error) throw created.error;
  }
}

export async function GET(request: Request) {
  try {
    const auth = await requireStaff(request);
    if (!auth.isOwner && !auth.isLicensee) throw new Response("Leadership access is required.", { status: 403 });

    const url = new URL(request.url);
    const from = dateText(url.searchParams.get("from")) || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const to = dateText(url.searchParams.get("to")) || new Date().toISOString().slice(0, 10);
    const requestedLocationId = text(url.searchParams.get("locationId"));

    const ids = await accessibleLocationIds(auth);
    const visibleIds = requestedLocationId && ids.includes(requestedLocationId) ? [requestedLocationId] : ids;
    if (requestedLocationId && !ids.includes(requestedLocationId)) throw new Response("You do not have access to that location.", { status: 403 });

    await syncPossibleNoShows(auth, visibleIds);

    const [locationsResult, assignmentsResult, typesResult, eventsResult, coachingResult] = await Promise.all([
      auth.admin
        .from("locations")
        .select("id,name,full_name,slug,color_primary,color_secondary")
        .eq("organization_id", auth.profile.organization_id)
        .in("id", visibleIds.length ? visibleIds : ["00000000-0000-0000-0000-000000000000"])
        .eq("is_active", true)
        .order("name"),
      auth.admin
        .from("staff_location_assignments")
        .select("user_id,location_id")
        .eq("organization_id", auth.profile.organization_id)
        .in("location_id", visibleIds.length ? visibleIds : ["00000000-0000-0000-0000-000000000000"]),
      auth.admin
        .from("staff_performance_event_types")
        .select("id,code,label,category,description,suggested_points,requires_review,is_active,sort_order")
        .eq("organization_id", auth.profile.organization_id)
        .eq("is_active", true)
        .order("sort_order")
        .order("label"),
      auth.admin
        .from("staff_performance_events")
        .select("id,staff_user_id,location_id,event_type_id,event_date,summary,notes,recognition_points,status,source_system,source_reference,created_by,reviewed_by,reviewed_at,created_at,updated_at")
        .eq("organization_id", auth.profile.organization_id)
        .in("location_id", visibleIds.length ? visibleIds : ["00000000-0000-0000-0000-000000000000"])
        .gte("event_date", from)
        .lte("event_date", to)
        .order("event_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1000),
      auth.admin
        .from("staff_coaching_records")
        .select("id,staff_user_id,location_id,record_type,incident_date,summary,expectations,follow_up_date,status,employee_acknowledged_at,employee_response,created_by,resolved_by,resolved_at,created_at,updated_at")
        .eq("organization_id", auth.profile.organization_id)
        .in("location_id", visibleIds.length ? visibleIds : ["00000000-0000-0000-0000-000000000000"])
        .order("incident_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1000),
    ]);

    const errors = [locationsResult.error, assignmentsResult.error, typesResult.error, eventsResult.error, coachingResult.error].filter(Boolean);
    if (errors[0]) throw errors[0];

    const staffIds = [...new Set((assignmentsResult.data ?? []).map((row) => String(row.user_id)))];
    const staffResult = staffIds.length
      ? await auth.admin
          .from("staff_access")
          .select("user_id,full_name,email,role,is_active")
          .eq("organization_id", auth.profile.organization_id)
          .eq("is_active", true)
          .in("user_id", staffIds)
          .order("full_name")
      : { data: [], error: null };

    if (staffResult.error) throw staffResult.error;

    return Response.json({
      from,
      to,
      canConfigurePoints: auth.isOwner,
      locations: locationsResult.data ?? [],
      assignments: assignmentsResult.data ?? [],
      staff: staffResult.data ?? [],
      eventTypes: typesResult.data ?? [],
      events: eventsResult.data ?? [],
      coachingRecords: coachingResult.data ?? [],
    });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireStaff(request);
    if (!auth.isOwner && !auth.isLicensee) throw new Response("Leadership access is required.", { status: 403 });
    const body = (await request.json().catch(() => ({}))) as JsonObject;
    const recordType = text(body.recordType);

    if (recordType === "training_verified") {
      const staffUserId = text(body.staffUserId);
      const locationName = text(body.locationName);
      const completionId = text(body.completionId);
      const trainingTitle = text(body.trainingTitle);
      const completedAt = text(body.completedAt);
      if (!staffUserId || !locationName || !completionId || !trainingTitle) {
        return Response.json({ error: "Training completion details are incomplete." }, { status: 400 });
      }
      const canRecordForStaff = auth.user.id === staffUserId || auth.isOwner || auth.isLicensee;
      if (!canRecordForStaff) throw new Response("You cannot record performance for another employee.", { status: 403 });

      const locations = await auth.admin
        .from("locations")
        .select("id,slug,name,full_name")
        .eq("organization_id", auth.profile.organization_id)
        .eq("is_active", true);
      if (locations.error) throw locations.error;
      const normalized = normalizeLocation(locationName);
      const location = (locations.data ?? []).find((row) =>
        normalizeLocation(`${row.slug || ""} ${row.name || ""} ${row.full_name || ""}`) === normalized,
      );
      if (!location) return Response.json({ error: "Training location was not found." }, { status: 400 });

      await assertStaffAtLocation(auth, staffUserId, String(location.id));
      if (auth.isLicensee && auth.user.id !== staffUserId) await assertLocationAccess(auth, String(location.id));

      const typeResult = await auth.admin
        .from("staff_performance_event_types")
        .select("id,suggested_points")
        .eq("organization_id", auth.profile.organization_id)
        .eq("code", "training_completed")
        .eq("is_active", true)
        .maybeSingle();
      if (typeResult.error) throw typeResult.error;
      if (!typeResult.data) return Response.json({ error: "Training recognition rule is not configured." }, { status: 400 });

      const existing = await auth.admin
        .from("staff_performance_events")
        .select("id")
        .eq("organization_id", auth.profile.organization_id)
        .eq("staff_user_id", staffUserId)
        .eq("source_system", "Training Center")
        .eq("source_reference", completionId)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data?.id) return Response.json({ ok: true, id: existing.data.id, duplicate: true });

      const completedDate = completedAt && !Number.isNaN(new Date(completedAt).getTime())
        ? new Date(completedAt).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);
      const result = await auth.admin
        .from("staff_performance_events")
        .insert({
          organization_id: auth.profile.organization_id,
          staff_user_id: staffUserId,
          location_id: location.id,
          event_type_id: typeResult.data.id,
          event_date: completedDate,
          summary: `Completed verified training: ${trainingTitle}`,
          notes: "Created automatically when the Training Center completion became verified.",
          recognition_points: Math.max(0, Number(typeResult.data.suggested_points || 0)),
          status: "Confirmed",
          source_system: "Training Center",
          source_reference: completionId,
          created_by: auth.user.id,
          reviewed_by: auth.user.id,
          reviewed_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (result.error) throw result.error;
      return Response.json({ ok: true, id: result.data.id });
    }

    if (!auth.isOwner && !auth.isLicensee) throw new Response("Leadership access is required.", { status: 403 });

    if (recordType === "event") {
      const staffUserId = text(body.staffUserId);
      const locationId = text(body.locationId);
      const eventTypeId = text(body.eventTypeId);
      const eventDate = dateText(body.eventDate);
      const summary = text(body.summary);
      const notes = text(body.notes);
      if (!staffUserId || !locationId || !eventTypeId || !eventDate || !summary) {
        return Response.json({ error: "Employee, location, event type, date, and summary are required." }, { status: 400 });
      }

      await assertLocationAccess(auth, locationId);
      await assertStaffAtLocation(auth, staffUserId, locationId);

      const typeResult = await auth.admin
        .from("staff_performance_event_types")
        .select("id,category,suggested_points,requires_review")
        .eq("organization_id", auth.profile.organization_id)
        .eq("id", eventTypeId)
        .eq("is_active", true)
        .maybeSingle();
      if (typeResult.error) throw typeResult.error;
      if (!typeResult.data) return Response.json({ error: "That performance event type is not available." }, { status: 400 });

      const recognitionPoints = typeResult.data.category === "Recognition"
        ? Math.max(0, Math.round(numberValue(body.recognitionPoints)))
        : 0;
      const status = typeResult.data.category === "Accountability" || typeResult.data.requires_review
        ? "Pending Review"
        : "Confirmed";

      const result = await auth.admin
        .from("staff_performance_events")
        .insert({
          organization_id: auth.profile.organization_id,
          staff_user_id: staffUserId,
          location_id: locationId,
          event_type_id: eventTypeId,
          event_date: eventDate,
          summary,
          notes: notes || null,
          recognition_points: recognitionPoints,
          status,
          source_system: "Manual",
          created_by: auth.user.id,
          reviewed_by: status === "Confirmed" ? auth.user.id : null,
          reviewed_at: status === "Confirmed" ? new Date().toISOString() : null,
        })
        .select("id")
        .single();
      if (result.error) throw result.error;

      return Response.json({ ok: true, id: result.data.id, status });
    }

    if (recordType === "coaching") {
      const staffUserId = text(body.staffUserId);
      const locationId = text(body.locationId);
      const incidentDate = dateText(body.incidentDate);
      const recordKind = text(body.recordKind);
      const summary = text(body.summary);
      if (!staffUserId || !locationId || !incidentDate || !recordKind || !summary) {
        return Response.json({ error: "Employee, location, type, date, and summary are required." }, { status: 400 });
      }
      const allowed = new Set(["Coaching Note","Verbal Warning","Written Warning","Final Warning","Other"]);
      if (!allowed.has(recordKind)) return Response.json({ error: "Choose a valid coaching record type." }, { status: 400 });

      await assertLocationAccess(auth, locationId);
      await assertStaffAtLocation(auth, staffUserId, locationId);

      const result = await auth.admin
        .from("staff_coaching_records")
        .insert({
          organization_id: auth.profile.organization_id,
          staff_user_id: staffUserId,
          location_id: locationId,
          record_type: recordKind,
          incident_date: incidentDate,
          summary,
          expectations: text(body.expectations) || null,
          follow_up_date: dateText(body.followUpDate) || null,
          status: "Open",
          created_by: auth.user.id,
        })
        .select("id")
        .single();
      if (result.error) throw result.error;
      return Response.json({ ok: true, id: result.data.id });
    }

    return Response.json({ error: "Unsupported performance record type." }, { status: 400 });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireStaff(request);
    if (!auth.isOwner && !auth.isLicensee) throw new Response("Leadership access is required.", { status: 403 });
    const body = (await request.json().catch(() => ({}))) as JsonObject;
    const action = text(body.action);

    if (action === "review_event") {
      const id = text(body.id);
      const status = text(body.status);
      if (!id || !["Confirmed","Dismissed"].includes(status)) {
        return Response.json({ error: "Choose Confirmed or Dismissed." }, { status: 400 });
      }

      const current = await auth.admin
        .from("staff_performance_events")
        .select("id,location_id,event_type_id")
        .eq("organization_id", auth.profile.organization_id)
        .eq("id", id)
        .maybeSingle();
      if (current.error) throw current.error;
      if (!current.data) return Response.json({ error: "Performance event not found." }, { status: 404 });
      await assertLocationAccess(auth, String(current.data.location_id));

      const eventType = await auth.admin
        .from("staff_performance_event_types")
        .select("category")
        .eq("id", current.data.event_type_id)
        .maybeSingle();
      if (eventType.error) throw eventType.error;

      const patch: Record<string, unknown> = {
        status,
        reviewed_by: auth.user.id,
        reviewed_at: new Date().toISOString(),
      };
      if (eventType.data?.category === "Accountability") patch.recognition_points = 0;

      const result = await auth.admin
        .from("staff_performance_events")
        .update(patch)
        .eq("organization_id", auth.profile.organization_id)
        .eq("id", id);
      if (result.error) throw result.error;
      return Response.json({ ok: true });
    }

    if (action === "resolve_coaching") {
      const id = text(body.id);
      const status = text(body.status);
      if (!id || !["Open","Resolved","Void"].includes(status)) {
        return Response.json({ error: "Choose Open, Resolved, or Void." }, { status: 400 });
      }
      const current = await auth.admin
        .from("staff_coaching_records")
        .select("id,location_id")
        .eq("organization_id", auth.profile.organization_id)
        .eq("id", id)
        .maybeSingle();
      if (current.error) throw current.error;
      if (!current.data) return Response.json({ error: "Coaching record not found." }, { status: 404 });
      await assertLocationAccess(auth, String(current.data.location_id));

      const result = await auth.admin
        .from("staff_coaching_records")
        .update({
          status,
          resolved_by: status === "Resolved" ? auth.user.id : null,
          resolved_at: status === "Resolved" ? new Date().toISOString() : null,
        })
        .eq("organization_id", auth.profile.organization_id)
        .eq("id", id);
      if (result.error) throw result.error;
      return Response.json({ ok: true });
    }

    if (action === "update_event_type") {
      if (!auth.isOwner) throw new Response("Owner/Admin access is required to change point rules.", { status: 403 });
      const id = text(body.id);
      const suggestedPoints = Math.max(0, Math.round(numberValue(body.suggestedPoints)));
      const current = await auth.admin
        .from("staff_performance_event_types")
        .select("id,category")
        .eq("organization_id", auth.profile.organization_id)
        .eq("id", id)
        .maybeSingle();
      if (current.error) throw current.error;
      if (!current.data) return Response.json({ error: "Point rule not found." }, { status: 404 });
      if (current.data.category !== "Recognition") {
        return Response.json({ error: "Accountability events are tracked as counts, not negative reward points." }, { status: 400 });
      }
      const result = await auth.admin
        .from("staff_performance_event_types")
        .update({ suggested_points: suggestedPoints, updated_by: auth.user.id })
        .eq("organization_id", auth.profile.organization_id)
        .eq("id", id);
      if (result.error) throw result.error;
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unsupported performance action." }, { status: 400 });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
