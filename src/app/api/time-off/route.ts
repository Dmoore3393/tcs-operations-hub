import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";

type JsonObject = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
function bool(value: unknown) {
  return value === true || value === "true";
}
function intOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
}
function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
function validTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart <= bEnd && aEnd >= bStart;
}

async function accessibleLocationIds(auth: Awaited<ReturnType<typeof requireStaff>>) {
  const { admin, profile, isOwner } = auth;
  const locations = await admin
    .from("locations")
    .select("id,name,full_name,slug,is_active")
    .eq("organization_id", profile.organization_id)
    .eq("is_active", true)
    .order("name");
  if (locations.error) throw locations.error;

  if (isOwner) return { locations: locations.data ?? [], ids: new Set((locations.data ?? []).map((row) => String(row.id))) };

  const mine = await admin
    .from("staff_location_assignments")
    .select("location_id")
    .eq("organization_id", profile.organization_id)
    .eq("user_id", auth.user.id);
  if (mine.error) throw mine.error;
  const ids = new Set((mine.data ?? []).map((row) => String(row.location_id)));
  return { locations: (locations.data ?? []).filter((row) => ids.has(String(row.id))), ids };
}

async function approvalScopes(auth: Awaited<ReturnType<typeof requireStaff>>) {
  if (auth.isOwner) return new Set(["General", "Maintenance"]);
  const result = await auth.admin
    .from("staff_clock_exception_approvers")
    .select("approval_scope")
    .eq("organization_id", auth.profile.organization_id)
    .eq("user_id", auth.user.id)
    .eq("is_active", true);
  if (result.error) throw result.error;
  return new Set((result.data ?? []).map((row) => String(row.approval_scope)));
}

async function assertStaffAtLocation(auth: Awaited<ReturnType<typeof requireStaff>>, staffUserId: string, locationId: string) {
  const result = await auth.admin
    .from("staff_location_assignments")
    .select("user_id")
    .eq("organization_id", auth.profile.organization_id)
    .eq("user_id", staffUserId)
    .eq("location_id", locationId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Response("That employee is not assigned to the selected location.", { status: 400 });
}

export async function GET(request: Request) {
  try {
    const auth = await requireStaff(request);
    const { admin, profile, user, isOwner, isLicensee } = auth;
    const { locations, ids } = await accessibleLocationIds(auth);
    const scopes = await approvalScopes(auth);

    const [assignmentResult, requestResult, blackoutResult, settingsResult, staffResult, approverResult, exceptionResult] = await Promise.all([
      admin.from("staff_location_assignments").select("user_id,location_id").eq("organization_id", profile.organization_id),
      admin.from("time_off_requests").select("*").eq("organization_id", profile.organization_id).order("submitted_at", { ascending: false }),
      admin.from("time_off_blackouts").select("*").eq("organization_id", profile.organization_id).eq("is_active", true).order("start_date"),
      admin.from("staff_attendance_settings").select("*").eq("organization_id", profile.organization_id).maybeSingle(),
      admin.from("staff_access").select("user_id,full_name,role,is_active").eq("organization_id", profile.organization_id).eq("is_active", true).order("full_name"),
      admin.from("staff_clock_exception_approvers")
        .select("user_id,approval_scope,is_active")
        .eq("organization_id", profile.organization_id)
        .eq("is_active", true),
      admin.from("staff_clock_exceptions")
        .select("id,staff_user_id,location_id,shift_id,work_date,approval_scope,approved_start_time,approved_end_time,reason,status,approved_by,approved_at,revoked_by,revoked_at")
        .eq("organization_id", profile.organization_id)
        .order("work_date", { ascending: false })
        .order("approved_at", { ascending: false })
        .limit(250),
    ]);
    if (assignmentResult.error) throw assignmentResult.error;
    if (requestResult.error) throw requestResult.error;
    if (blackoutResult.error) throw blackoutResult.error;
    if (settingsResult.error) throw settingsResult.error;
    if (staffResult.error) throw staffResult.error;
    if (approverResult.error) throw approverResult.error;
    if (exceptionResult.error) throw exceptionResult.error;

    const assignments = assignmentResult.data ?? [];
    const staffIdsForAccessibleLocations = new Set(
      assignments.filter((row) => ids.has(String(row.location_id))).map((row) => String(row.user_id)),
    );

    const requests = (requestResult.data ?? []).filter((row) => {
      if (isOwner) return true;
      if (!isLicensee) return String(row.staff_user_id) === user.id;
      if (row.location_id) return ids.has(String(row.location_id));
      return false;
    });

    const blackouts = (blackoutResult.data ?? []).filter((row) => {
      if (row.location_id === null) return true;
      return ids.has(String(row.location_id));
    });

    const staff = (staffResult.data ?? []).filter((row) => {
      if (isOwner || scopes.has("General") || scopes.has("Maintenance")) return true;
      if (isLicensee) return staffIdsForAccessibleLocations.has(String(row.user_id));
      return String(row.user_id) === user.id;
    });

    const exceptions = (exceptionResult.data ?? []).filter((row) => {
      if (isOwner || scopes.has("General") || scopes.has("Maintenance")) return true;
      return String(row.staff_user_id) === user.id;
    });

    return Response.json({
      canManageBlackouts: isOwner || isLicensee,
      canCreateCompanyWideBlackout: isOwner,
      canReviewRequests: isOwner || isLicensee,
      canConfigureAttendance: isOwner,
      canApproveGeneralClockExceptions: isOwner || scopes.has("General"),
      canApproveMaintenanceClockExceptions: isOwner || scopes.has("General") || scopes.has("Maintenance"),
      canSetMaintenanceApprover: isOwner || scopes.has("General"),
      currentUserId: user.id,
      locations,
      assignments,
      staff,
      requests,
      blackouts,
      clockApprovers: approverResult.data ?? [],
      clockExceptions: exceptions,
      attendanceSettings: settingsResult.data ?? {
        late_tracking_enabled: false,
        late_grace_minutes: null,
        early_departure_tracking_enabled: false,
        early_departure_grace_minutes: null,
        no_show_tracking_enabled: false,
        no_show_after_minutes: null,
        enforce_schedule_clocking: true,
        early_clock_in_window_minutes: 4,
        late_clock_out_window_minutes: 4,
        flag_scheduled_hours_overage: true,
      },
    }, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireStaff(request);
    const { admin, user, profile, isOwner, isLicensee } = auth;
    const body = await request.json().catch(() => ({})) as JsonObject;
    const action = text(body.action);
    const { ids } = await accessibleLocationIds(auth);

    if (action === "create_blackout") {
      if (!isOwner && !isLicensee) throw new Response("Leadership access is required.", { status: 403 });
      const locationId = text(body.locationId) || null;
      const startDate = text(body.startDate);
      const endDate = text(body.endDate);
      const title = text(body.title);
      if (!title || !validDate(startDate) || !validDate(endDate) || endDate < startDate) {
        return Response.json({ error: "Enter a title and valid blackout date range." }, { status: 400 });
      }
      if (!isOwner && !locationId) throw new Response("Location leadership can only block dates for their assigned location.", { status: 403 });
      if (locationId && !ids.has(locationId)) throw new Response("That location is outside your access.", { status: 403 });

      const result = await admin.from("time_off_blackouts").insert({
        organization_id: profile.organization_id,
        location_id: locationId,
        title,
        reason: text(body.reason) || null,
        start_date: startDate,
        end_date: endDate,
        block_requests: bool(body.blockRequests),
        notes: text(body.notes) || null,
        is_active: true,
        created_by: user.id,
        updated_by: user.id,
      }).select("*").single();
      if (result.error) throw result.error;
      return Response.json({ ok: true, blackout: result.data });
    }

    if (action === "request_time_off") {
      const startDate = text(body.startDate);
      const endDate = text(body.endDate);
      const requestScope = text(body.requestScope) === "Specific Location" ? "Specific Location" : "All Assigned Locations";
      const locationId = requestScope === "Specific Location" ? text(body.locationId) : "";
      if (!validDate(startDate) || !validDate(endDate) || endDate < startDate) {
        return Response.json({ error: "Choose a valid time-off date range." }, { status: 400 });
      }
      if (requestScope === "Specific Location" && (!locationId || !ids.has(locationId))) {
        return Response.json({ error: "Choose one of your assigned locations." }, { status: 400 });
      }

      const assigned = await admin
        .from("staff_location_assignments")
        .select("location_id")
        .eq("organization_id", profile.organization_id)
        .eq("user_id", user.id);
      if (assigned.error) throw assigned.error;
      const assignedIds = new Set((assigned.data ?? []).map((row) => String(row.location_id)));
      if (requestScope === "Specific Location" && !assignedIds.has(locationId)) {
        throw new Response("That location is not assigned to your staff account.", { status: 403 });
      }

      const blackouts = await admin
        .from("time_off_blackouts")
        .select("id,location_id,title,reason,start_date,end_date,block_requests")
        .eq("organization_id", profile.organization_id)
        .eq("is_active", true)
        .eq("block_requests", true)
        .lte("start_date", endDate)
        .gte("end_date", startDate);
      if (blackouts.error) throw blackouts.error;

      const conflict = (blackouts.data ?? []).find((row) => {
        if (!overlaps(startDate, endDate, String(row.start_date), String(row.end_date))) return false;
        if (row.location_id === null) return true;
        if (requestScope === "Specific Location") return String(row.location_id) === locationId;
        return assignedIds.has(String(row.location_id));
      });
      if (conflict) {
        return Response.json({
          error: `That date cannot be requested off because “${conflict.title}” is a blocked date (${conflict.start_date}–${conflict.end_date}).`,
          blackout: conflict,
        }, { status: 409 });
      }

      const duplicate = await admin
        .from("time_off_requests")
        .select("id,start_date,end_date,status")
        .eq("organization_id", profile.organization_id)
        .eq("staff_user_id", user.id)
        .in("status", ["Pending", "Approved"])
        .lte("start_date", endDate)
        .gte("end_date", startDate)
        .limit(1);
      if (duplicate.error) throw duplicate.error;
      if ((duplicate.data ?? []).length) {
        return Response.json({ error: "You already have a pending or approved request that overlaps these dates." }, { status: 409 });
      }

      const allDay = body.allDay !== false;
      const result = await admin.from("time_off_requests").insert({
        organization_id: profile.organization_id,
        staff_user_id: user.id,
        location_id: requestScope === "Specific Location" ? locationId : null,
        request_scope: requestScope,
        request_type: ["Time Off","Vacation","Unpaid","Appointment","Other"].includes(text(body.requestType)) ? text(body.requestType) : "Time Off",
        start_date: startDate,
        end_date: endDate,
        all_day: allDay,
        start_time: allDay ? null : text(body.startTime),
        end_time: allDay ? null : text(body.endTime),
        reason: text(body.reason) || null,
        status: "Pending",
      }).select("*").single();
      if (result.error) throw result.error;
      return Response.json({ ok: true, request: result.data });
    }

    if (action === "create_clock_exception") {
      const scopes = await approvalScopes(auth);
      const approvalScope = text(body.approvalScope) === "Maintenance" ? "Maintenance" : "General";
      const allowed = approvalScope === "General" ? scopes.has("General") : scopes.has("General") || scopes.has("Maintenance");
      if (!allowed) throw new Response("You are not authorized to approve that type of shift exception.", { status: 403 });

      const staffUserId = text(body.staffUserId);
      const locationId = text(body.locationId);
      const workDate = text(body.workDate);
      const approvedStartTime = text(body.approvedStartTime);
      const approvedEndTime = text(body.approvedEndTime);
      const reason = text(body.reason);
      if (!staffUserId || !locationId || !validDate(workDate) || !reason) {
        return Response.json({ error: "Employee, location, date, and approval reason are required." }, { status: 400 });
      }
      if (staffUserId === user.id) {
        return Response.json({ error: "Shift exceptions must be approved by another authorized person." }, { status: 400 });
      }
      if (!approvedStartTime && !approvedEndTime) {
        return Response.json({ error: "Enter an approved start time, approved end time, or both." }, { status: 400 });
      }
      if (approvedStartTime && !validTime(approvedStartTime)) return Response.json({ error: "Enter a valid approved start time." }, { status: 400 });
      if (approvedEndTime && !validTime(approvedEndTime)) return Response.json({ error: "Enter a valid approved end time." }, { status: 400 });
      if (approvedStartTime && approvedEndTime && approvedEndTime <= approvedStartTime) {
        return Response.json({ error: "Approved end time must be after the approved start time." }, { status: 400 });
      }

      await assertStaffAtLocation(auth, staffUserId, locationId);

      const result = await admin.from("staff_clock_exceptions").insert({
        organization_id: profile.organization_id,
        staff_user_id: staffUserId,
        location_id: locationId,
        work_date: workDate,
        approval_scope: approvalScope,
        approved_start_time: approvedStartTime || null,
        approved_end_time: approvedEndTime || null,
        reason,
        status: "Approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      }).select("*").single();
      if (result.error) throw result.error;
      return Response.json({ ok: true, exception: result.data });
    }

    return Response.json({ error: "Choose a valid time-off action." }, { status: 400 });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireStaff(request);
    const { admin, user, profile, isOwner, isLicensee } = auth;
    const body = await request.json().catch(() => ({})) as JsonObject;
    const action = text(body.action);
    const { ids } = await accessibleLocationIds(auth);

    if (action === "review_request") {
      if (!isOwner && !isLicensee) throw new Response("Leadership access is required.", { status: 403 });
      const id = text(body.id);
      const status = text(body.status);
      if (!["Approved", "Denied"].includes(status)) return Response.json({ error: "Choose Approved or Denied." }, { status: 400 });

      const current = await admin
        .from("time_off_requests")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .eq("id", id)
        .maybeSingle();
      if (current.error) throw current.error;
      if (!current.data) return Response.json({ error: "Request not found." }, { status: 404 });
      if (!isOwner) {
        if (!current.data.location_id || !ids.has(String(current.data.location_id))) {
          throw new Response("Company-wide requests require owner/admin review.", { status: 403 });
        }
      }

      const result = await admin.from("time_off_requests").update({
        status,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_notes: text(body.reviewNotes) || null,
      }).eq("id", id).select("*").single();
      if (result.error) throw result.error;
      return Response.json({ ok: true, request: result.data });
    }

    if (action === "cancel_request") {
      const id = text(body.id);
      const current = await admin
        .from("time_off_requests")
        .select("id,staff_user_id,status")
        .eq("organization_id", profile.organization_id)
        .eq("id", id)
        .maybeSingle();
      if (current.error) throw current.error;
      if (!current.data) return Response.json({ error: "Request not found." }, { status: 404 });
      if (String(current.data.staff_user_id) !== user.id && !isOwner) throw new Response("You cannot cancel this request.", { status: 403 });
      if (!["Pending", "Approved"].includes(String(current.data.status))) {
        return Response.json({ error: "Only pending or approved requests can be cancelled." }, { status: 400 });
      }
      const result = await admin.from("time_off_requests").update({
        status: "Cancelled",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      }).eq("id", id).select("*").single();
      if (result.error) throw result.error;
      return Response.json({ ok: true, request: result.data });
    }

    if (action === "update_attendance_settings") {
      if (!isOwner) throw new Response("Owner/Admin access is required.", { status: 403 });
      const payload = {
        organization_id: profile.organization_id,
        late_tracking_enabled: bool(body.lateTrackingEnabled),
        late_grace_minutes: intOrNull(body.lateGraceMinutes),
        early_departure_tracking_enabled: bool(body.earlyDepartureTrackingEnabled),
        early_departure_grace_minutes: intOrNull(body.earlyDepartureGraceMinutes),
        no_show_tracking_enabled: bool(body.noShowTrackingEnabled),
        no_show_after_minutes: intOrNull(body.noShowAfterMinutes),
        enforce_schedule_clocking: body.enforceScheduleClocking !== false,
        early_clock_in_window_minutes: Math.max(0, intOrNull(body.earlyClockInWindowMinutes) ?? 4),
        late_clock_out_window_minutes: Math.max(0, intOrNull(body.lateClockOutWindowMinutes) ?? 4),
        flag_scheduled_hours_overage: body.flagScheduledHoursOverage !== false,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      };
      const result = await admin.from("staff_attendance_settings").upsert(payload, { onConflict: "organization_id" }).select("*").single();
      if (result.error) throw result.error;
      return Response.json({ ok: true, attendanceSettings: result.data });
    }

    if (action === "deactivate_blackout") {
      if (!isOwner && !isLicensee) throw new Response("Leadership access is required.", { status: 403 });
      const id = text(body.id);
      const current = await admin.from("time_off_blackouts").select("id,location_id").eq("organization_id", profile.organization_id).eq("id", id).maybeSingle();
      if (current.error) throw current.error;
      if (!current.data) return Response.json({ error: "Blackout not found." }, { status: 404 });
      if (!isOwner && (!current.data.location_id || !ids.has(String(current.data.location_id)))) throw new Response("You cannot change that blackout.", { status: 403 });
      const result = await admin.from("time_off_blackouts").update({ is_active: false, updated_by: user.id }).eq("id", id).select("id").single();
      if (result.error) throw result.error;
      return Response.json({ ok: true });
    }

    if (action === "revoke_clock_exception") {
      const scopes = await approvalScopes(auth);
      if (!scopes.has("General") && !scopes.has("Maintenance")) throw new Response("Shift-exception approval access is required.", { status: 403 });
      const id = text(body.id);
      const current = await admin.from("staff_clock_exceptions")
        .select("id,approval_scope,status")
        .eq("organization_id", profile.organization_id)
        .eq("id", id)
        .maybeSingle();
      if (current.error) throw current.error;
      if (!current.data) return Response.json({ error: "Shift exception not found." }, { status: 404 });
      if (String(current.data.approval_scope) === "General" && !scopes.has("General")) {
        throw new Response("Only a general shift-exception approver can revoke this approval.", { status: 403 });
      }
      const result = await admin.from("staff_clock_exceptions").update({
        status: "Revoked",
        revoked_by: user.id,
        revoked_at: new Date().toISOString(),
      }).eq("id", id).select("id").single();
      if (result.error) throw result.error;
      return Response.json({ ok: true });
    }

    if (action === "set_maintenance_approver") {
      const scopes = await approvalScopes(auth);
      if (!scopes.has("General")) throw new Response("General shift-exception approval access is required.", { status: 403 });
      const staffUserId = text(body.staffUserId);

      const deactivate = await admin.from("staff_clock_exception_approvers")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("organization_id", profile.organization_id)
        .eq("approval_scope", "Maintenance");
      if (deactivate.error) throw deactivate.error;

      if (staffUserId) {
        const target = await admin.from("staff_access")
          .select("user_id,is_active")
          .eq("organization_id", profile.organization_id)
          .eq("user_id", staffUserId)
          .eq("is_active", true)
          .maybeSingle();
        if (target.error) throw target.error;
        if (!target.data) return Response.json({ error: "Choose an active staff account." }, { status: 400 });

        const result = await admin.from("staff_clock_exception_approvers").upsert({
          organization_id: profile.organization_id,
          user_id: staffUserId,
          approval_scope: "Maintenance",
          is_active: true,
          created_by: user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: "organization_id,user_id,approval_scope" });
        if (result.error) throw result.error;
      }
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Choose a valid update action." }, { status: 400 });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
