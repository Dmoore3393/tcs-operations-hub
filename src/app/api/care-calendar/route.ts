import {
  addIsoDays,
  defaultCareCalendarSettings,
  firstUpcomingWeek,
  isoDateInTimeZone,
  type CareCalendarSettings,
} from "@/lib/family-care-calendar";
import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";
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

async function loadSettings(admin: SupabaseClient, organizationId: string): Promise<CareCalendarSettings> {
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

async function accessibleLocations(admin: SupabaseClient, organizationId: string, userId: string, isOwner: boolean) {
  const locationResult = await admin
    .from("locations")
    .select("id,slug,name,full_name,capacity,program_type")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("name");
  if (locationResult.error) throw locationResult.error;

  const allLocations = (locationResult.data ?? []) as unknown as DbRow[];
  if (isOwner) return allLocations;

  const assignmentResult = await admin
    .from("staff_location_assignments")
    .select("location_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId);
  if (assignmentResult.error) throw assignmentResult.error;
  const allowed = new Set(((assignmentResult.data ?? []) as unknown as DbRow[]).map((row) => text(row.location_id)));
  return allLocations.filter((row) => allowed.has(text(row.id)));
}

function canReviewSchedules(profile: { permissions: string[] }, isOwner: boolean, isLicensee: boolean) {
  return isOwner || isLicensee || profile.permissions.includes("schedules") || profile.permissions.includes("ratios");
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
    const { admin, user, profile, isOwner, isLicensee } = await requireStaff(request);
    if (!canReviewSchedules(profile, isOwner, isLicensee)) {
      throw new Response("Schedule-review access is required for the Family Care Calendar.", { status: 403 });
    }

    const settings = await loadSettings(admin, profile.organization_id);
    const url = new URL(request.url);
    const start = url.searchParams.get("start") || isoDateInTimeZone(new Date(), settings.timeZone);
    const end = url.searchParams.get("end") || addIsoDays(firstUpcomingWeek(new Date(), settings.timeZone), settings.weeksAhead * 7 - 1);
    const locations = await accessibleLocations(admin, profile.organization_id, user.id, isOwner);
    const locationIds = locations.map((row) => text(row.id)).filter(Boolean);

    const closureQuery = admin
      .from("care_calendar_closures")
      .select("id,location_id,closure_date,title,note,created_at")
      .eq("organization_id", profile.organization_id)
      .gte("closure_date", start)
      .lte("closure_date", end)
      .order("closure_date");

    const submissionQuery = locationIds.length
      ? admin
          .from("family_schedule_submissions")
          .select("id,location_id,child_id,child_legacy_id,week_of,request_kind,status,schedule_data,submitted_by_email,submitted_at,deadline_at,late_by_minutes,reviewed_at,review_note")
          .eq("organization_id", profile.organization_id)
          .in("location_id", locationIds)
          .gte("week_of", addIsoDays(start, -7))
          .lte("week_of", end)
          .order("submitted_at", { ascending: false })
      : Promise.resolve({ data: [], error: null });

    const overrideQuery = locationIds.length
      ? admin
          .from("child_schedule_overrides")
          .select("id,location_id,child_id,child_legacy_id,service_date,no_care,start_time,end_time,note,source_submission_id")
          .eq("organization_id", profile.organization_id)
          .in("location_id", locationIds)
          .gte("service_date", start)
          .lte("service_date", end)
      : Promise.resolve({ data: [], error: null });

    const [closureResult, submissionResult, overrideResult] = await Promise.all([
      closureQuery,
      submissionQuery,
      overrideQuery,
    ]);

    const failure = closureResult.error || submissionResult.error || overrideResult.error;
    if (failure) throw failure;

    const visibleClosures = ((closureResult.data ?? []) as unknown as DbRow[]).filter((row) => {
      const locationId = text(row.location_id);
      return !locationId || isOwner || locationIds.includes(locationId);
    });

    const childIds = [...new Set(((submissionResult.data ?? []) as unknown as DbRow[]).map((row) => text(row.child_id)).filter(Boolean))];
    const childResult = childIds.length
      ? await admin.from("children").select("id,legacy_id,first_name,last_name,age_group").in("id", childIds)
      : { data: [], error: null };
    if (childResult.error) throw childResult.error;

    const childMap = new Map(
      ((childResult.data ?? []) as unknown as DbRow[]).map((row) => [text(row.id), {
        legacyId: text(row.legacy_id),
        name: `${text(row.first_name)} ${text(row.last_name)}`.trim(),
        ageGroup: text(row.age_group),
      }]),
    );

    return Response.json({
      settings,
      canManageClosures: isOwner,
      locations: locations.map((row) => ({
        id: text(row.id),
        slug: text(row.slug),
        name: text(row.name),
        fullName: text(row.full_name),
        capacity: numberValue(row.capacity, 0),
        programType: text(row.program_type),
      })),
      closures: visibleClosures.map((row) => ({
        id: text(row.id),
        locationId: text(row.location_id),
        date: text(row.closure_date),
        title: text(row.title) || "TCS Closed",
        note: text(row.note),
        createdAt: text(row.created_at),
      })),
      submissions: ((submissionResult.data ?? []) as unknown as DbRow[]).map((row) => {
        const child = childMap.get(text(row.child_id));
        return {
          id: text(row.id),
          locationId: text(row.location_id),
          childId: text(row.child_legacy_id) || child?.legacyId || "",
          childName: child?.name || "Child",
          ageGroup: child?.ageGroup || "",
          weekOf: text(row.week_of),
          requestKind: text(row.request_kind),
          status: text(row.status),
          schedule: scheduleDays(row.schedule_data),
          submittedByEmail: text(row.submitted_by_email),
          submittedAt: text(row.submitted_at),
          deadlineAt: text(row.deadline_at),
          lateByMinutes: numberValue(row.late_by_minutes, 0),
          reviewedAt: text(row.reviewed_at),
          reviewNote: text(row.review_note),
        };
      }),
      overrides: ((overrideResult.data ?? []) as unknown as DbRow[]).map((row) => ({
        id: text(row.id),
        locationId: text(row.location_id),
        childId: text(row.child_legacy_id),
        date: text(row.service_date),
        noCare: row.no_care === true,
        startTime: text(row.start_time).slice(0, 5),
        endTime: text(row.end_time).slice(0, 5),
        note: text(row.note),
        sourceSubmissionId: text(row.source_submission_id),
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isMissingTable(error)) {
      return Response.json({ error: "The Family Care Calendar database setup has not been applied yet." }, { status: 503 });
    }
    return staffErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { admin, user, profile, isOwner } = await requireStaff(request);
    if (!isOwner) throw new Response("Only an Owner/Admin can block care dates.", { status: 403 });

    const body = object(await request.json().catch(() => ({})));
    const date = text(body.date);
    const locationId = text(body.locationId);
    const title = text(body.title).slice(0, 160) || "TCS Closed";
    const note = text(body.note).slice(0, 1000);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Response("Choose a valid closure date.", { status: 400 });
    }

    if (locationId) {
      const locationResult = await admin
        .from("locations")
        .select("id")
        .eq("organization_id", profile.organization_id)
        .eq("id", locationId)
        .eq("is_active", true)
        .maybeSingle();
      if (locationResult.error) throw locationResult.error;
      if (!locationResult.data) throw new Response("That location is not active.", { status: 404 });
    }

    const insertResult = await admin
      .from("care_calendar_closures")
      .insert({
        organization_id: profile.organization_id,
        location_id: locationId || null,
        closure_date: date,
        title,
        note: note || null,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (insertResult.error) throw insertResult.error;

    let affectedQuery = admin
      .from("child_schedule_overrides")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", profile.organization_id)
      .eq("service_date", date)
      .eq("no_care", false);
    if (locationId) affectedQuery = affectedQuery.eq("location_id", locationId);
    const affectedResult = await affectedQuery;

    await admin.from("audit_log").insert({
      organization_id: profile.organization_id,
      location_id: locationId || null,
      actor_user_id: user.id,
      action: "INSERT",
      table_name: "care_calendar_closures",
      row_id: insertResult.data.id,
      metadata: { kind: "care_calendar_closure_created", date, title, affectedApprovedCareDays: affectedResult.count ?? 0 },
    });

    return Response.json({
      ok: true,
      id: insertResult.data.id,
      affectedApprovedCareDays: affectedResult.count ?? 0,
      message: affectedResult.count
        ? `Closure saved. ${affectedResult.count} approved care entr${affectedResult.count === 1 ? "y is" : "ies are"} affected and should be reviewed.`
        : "Closure saved. Parents will not be able to request care on this date.",
    });
  } catch (error) {
    if (isMissingTable(error)) {
      return Response.json({ error: "The Family Care Calendar database setup has not been applied yet." }, { status: 503 });
    }
    return staffErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { admin, user, profile, isOwner } = await requireStaff(request);
    if (!isOwner) throw new Response("Only an Owner/Admin can remove blocked care dates.", { status: 403 });
    const body = object(await request.json().catch(() => ({})));
    const id = text(body.id);
    if (!id) throw new Response("Choose the closure to remove.", { status: 400 });

    const existing = await admin
      .from("care_calendar_closures")
      .select("id,location_id,closure_date,title")
      .eq("organization_id", profile.organization_id)
      .eq("id", id)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data) throw new Response("That closure was not found.", { status: 404 });

    const remove = await admin.from("care_calendar_closures").delete().eq("id", id);
    if (remove.error) throw remove.error;

    await admin.from("audit_log").insert({
      organization_id: profile.organization_id,
      location_id: existing.data.location_id,
      actor_user_id: user.id,
      action: "DELETE",
      table_name: "care_calendar_closures",
      row_id: id,
      metadata: { kind: "care_calendar_closure_removed", date: existing.data.closure_date, title: existing.data.title },
    });

    return Response.json({ ok: true, message: "The date is open for schedule requests again." });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { admin, user, profile, isOwner, isLicensee } = await requireStaff(request);
    if (!canReviewSchedules(profile, isOwner, isLicensee)) {
      throw new Response("Schedule-review access is required.", { status: 403 });
    }

    const body = object(await request.json().catch(() => ({})));
    const submissionId = text(body.submissionId);
    const decision = text(body.decision);
    const note = text(body.note).slice(0, 1000);

    if (!submissionId || !["Approved", "Needs Changes", "Unable to Accommodate"].includes(decision)) {
      throw new Response("Choose a schedule request and a valid review decision.", { status: 400 });
    }

    const submissionResult = await admin
      .from("family_schedule_submissions")
      .select("id,organization_id,location_id,child_id,child_legacy_id,week_of,status,schedule_data")
      .eq("organization_id", profile.organization_id)
      .eq("id", submissionId)
      .maybeSingle();
    if (submissionResult.error) throw submissionResult.error;
    if (!submissionResult.data) throw new Response("That schedule request was not found.", { status: 404 });

    const submission = submissionResult.data as unknown as DbRow;
    const locationId = text(submission.location_id);
    if (!isOwner) {
      const assignment = await admin
        .from("staff_location_assignments")
        .select("location_id")
        .eq("organization_id", profile.organization_id)
        .eq("user_id", user.id)
        .eq("location_id", locationId)
        .maybeSingle();
      if (assignment.error) throw assignment.error;
      if (!assignment.data) throw new Response("This schedule belongs to a location outside your assignment.", { status: 403 });
    }

    if (decision === "Approved") {
      const days = scheduleDays(submission.schedule_data);
      const careDates = days.filter((day) => !day.noCare).map((day) => day.date);
      if (careDates.length) {
        const closureResult = await admin
          .from("care_calendar_closures")
          .select("closure_date,location_id,title")
          .eq("organization_id", profile.organization_id)
          .in("closure_date", careDates);
        if (closureResult.error) throw closureResult.error;
        const blocked = ((closureResult.data ?? []) as unknown as DbRow[]).find((row) => {
          const closureLocation = text(row.location_id);
          return !closureLocation || closureLocation === locationId;
        });
        if (blocked) {
          throw new Response(`This request includes a blocked date (${text(blocked.closure_date)} — ${text(blocked.title) || "TCS Closed"}). Update the closure or ask the family for changes before approving.`, { status: 409 });
        }
      }

      const overrideRows = days.map((day) => ({
        organization_id: profile.organization_id,
        location_id: locationId,
        child_id: text(submission.child_id),
        child_legacy_id: text(submission.child_legacy_id),
        service_date: day.date,
        no_care: day.noCare,
        start_time: day.noCare ? null : day.startTime,
        end_time: day.noCare ? null : day.endTime,
        note: day.note || null,
        source_submission_id: submissionId,
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      }));

      const overrideResult = await admin
        .from("child_schedule_overrides")
        .upsert(overrideRows, { onConflict: "organization_id,child_id,service_date" });
      if (overrideResult.error) throw overrideResult.error;

      const oldApproved = await admin
        .from("family_schedule_submissions")
        .update({ status: "Superseded" })
        .eq("organization_id", profile.organization_id)
        .eq("child_id", text(submission.child_id))
        .eq("week_of", text(submission.week_of))
        .eq("status", "Approved")
        .neq("id", submissionId);
      if (oldApproved.error) throw oldApproved.error;
    }

    const reviewResult = await admin
      .from("family_schedule_submissions")
      .update({
        status: decision,
        review_note: note || null,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", submissionId)
      .select("id,status")
      .single();
    if (reviewResult.error) throw reviewResult.error;

    await admin.from("audit_log").insert({
      organization_id: profile.organization_id,
      location_id: locationId,
      actor_user_id: user.id,
      action: "UPDATE",
      table_name: "family_schedule_submissions",
      row_id: submissionId,
      metadata: {
        kind: "family_schedule_reviewed",
        decision,
        weekOf: text(submission.week_of),
        childLegacyId: text(submission.child_legacy_id),
        reviewNote: note || null,
      },
    });

    return Response.json({
      ok: true,
      status: decision,
      message: decision === "Approved"
        ? "Schedule approved. These dated care times now feed the Ratio Plan."
        : decision === "Needs Changes"
          ? "The family schedule was returned for changes."
          : "The family schedule was marked unable to accommodate.",
    });
  } catch (error) {
    if (isMissingTable(error)) {
      return Response.json({ error: "The Family Care Calendar database setup has not been applied yet." }, { status: 503 });
    }
    return staffErrorResponse(error);
  }
}
