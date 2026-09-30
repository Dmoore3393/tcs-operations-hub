import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";

export const runtime = "nodejs";

type DbRow = Record<string, unknown>;

function object(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DbRow : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function dateText(value: unknown) {
  const next = text(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(next) ? next : "";
}

function addDays(date: string, days: number) {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + days);
  const year = next.getFullYear();
  const month = String(next.getMonth() + 1).padStart(2, "0");
  const day = String(next.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function safeRatings(value: unknown) {
  const allowed = new Set(["Strong", "On Track", "Needs Support", "Not Reviewed"]);
  const raw = object(value);
  const keys = ["safety", "reliability", "communication", "teamwork", "routines", "growth"];
  return Object.fromEntries(keys.map((key) => {
    const next = text(raw[key]);
    return [key, allowed.has(next) ? next : "Not Reviewed"];
  }));
}

async function accessibleLocationIds(auth: Awaited<ReturnType<typeof requireStaff>>) {
  if (auth.isOwner) {
    const result = await auth.admin
      .from("locations")
      .select("id")
      .eq("organization_id", auth.profile.organization_id)
      .eq("is_active", true);
    if (result.error) throw result.error;
    return (result.data ?? []).map((row) => String(row.id));
  }

  const result = await auth.admin
    .from("staff_location_assignments")
    .select("location_id")
    .eq("organization_id", auth.profile.organization_id)
    .eq("user_id", auth.user.id);
  if (result.error) throw result.error;
  return [...new Set((result.data ?? []).map((row) => String(row.location_id)))];
}

async function assertLeadershipLocation(
  auth: Awaited<ReturnType<typeof requireStaff>>,
  locationId: string,
) {
  if (!auth.isOwner && !auth.isLicensee) {
    throw new Response("Leadership access is required.", { status: 403 });
  }
  const ids = await accessibleLocationIds(auth);
  if (!ids.includes(locationId)) throw new Response("You do not have access to that location.", { status: 403 });
}

async function planById(auth: Awaited<ReturnType<typeof requireStaff>>, planId: string) {
  const result = await auth.admin
    .from("staff_checkin_plans")
    .select("id,organization_id,staff_user_id,location_id,start_date,manager_user_id,status")
    .eq("organization_id", auth.profile.organization_id)
    .eq("id", planId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Response("That 30/60/90 plan was not found.", { status: 404 });
  return result.data;
}

async function checkinById(auth: Awaited<ReturnType<typeof requireStaff>>, id: string) {
  const result = await auth.admin
    .from("staff_checkins")
    .select("id,plan_id,organization_id,staff_user_id,location_id,milestone_days,due_date,status")
    .eq("organization_id", auth.profile.organization_id)
    .eq("id", id)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Response("That employee check-in was not found.", { status: 404 });
  return result.data;
}

export async function GET(request: Request) {
  try {
    const auth = await requireStaff(request);
    const canManage = auth.isOwner || auth.isLicensee;
    const visibleLocationIds = await accessibleLocationIds(auth);

    const locationResult = visibleLocationIds.length
      ? await auth.admin
          .from("locations")
          .select("id,name,full_name,slug")
          .eq("organization_id", auth.profile.organization_id)
          .in("id", visibleLocationIds)
          .eq("is_active", true)
          .order("name")
      : { data: [], error: null };
    if (locationResult.error) throw locationResult.error;

    let staffRows: DbRow[] = [];
    if (canManage) {
      const assignmentResult = visibleLocationIds.length
        ? await auth.admin
            .from("staff_location_assignments")
            .select("user_id,location_id")
            .eq("organization_id", auth.profile.organization_id)
            .in("location_id", visibleLocationIds)
        : { data: [], error: null };
      if (assignmentResult.error) throw assignmentResult.error;

      const userIds = [...new Set((assignmentResult.data ?? []).map((row) => String(row.user_id)))];
      const staffResult = userIds.length
        ? await auth.admin
            .from("staff_access")
            .select("user_id,full_name,email,role,is_active,accepted_at,created_at")
            .eq("organization_id", auth.profile.organization_id)
            .eq("is_active", true)
            .in("user_id", userIds)
            .order("full_name")
        : { data: [], error: null };
      if (staffResult.error) throw staffResult.error;

      const laneResult = userIds.length
        ? await auth.admin
            .from("staff_lane_profiles")
            .select("staff_user_id,job_title,secondary_title,reports_to_label,primary_location")
            .eq("organization_id", auth.profile.organization_id)
            .eq("is_active", true)
            .in("staff_user_id", userIds)
        : { data: [], error: null };
      if (laneResult.error) throw laneResult.error;

      const laneMap = new Map((laneResult.data ?? []).map((row) => [String(row.staff_user_id), row]));
      const assignmentMap = new Map<string, string[]>();
      for (const row of assignmentResult.data ?? []) {
        const key = String(row.user_id);
        assignmentMap.set(key, [...(assignmentMap.get(key) ?? []), String(row.location_id)]);
      }

      staffRows = ((staffResult.data ?? []) as unknown as DbRow[]).map((row) => {
        const lane = laneMap.get(text(row.user_id));
        return {
          ...row,
          job_title: lane?.job_title ?? null,
          secondary_title: lane?.secondary_title ?? null,
          reports_to_label: lane?.reports_to_label ?? null,
          primary_location: lane?.primary_location ?? null,
          location_ids: assignmentMap.get(text(row.user_id)) ?? [],
        };
      });
    } else {
      const laneResult = await auth.admin
        .from("staff_lane_profiles")
        .select("job_title,secondary_title,reports_to_label,primary_location")
        .eq("organization_id", auth.profile.organization_id)
        .eq("staff_user_id", auth.user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (laneResult.error) throw laneResult.error;

      staffRows = [{
        user_id: auth.user.id,
        full_name: auth.profile.full_name,
        email: auth.profile.email,
        role: auth.profile.role,
        is_active: true,
        job_title: laneResult.data?.job_title ?? null,
        secondary_title: laneResult.data?.secondary_title ?? null,
        reports_to_label: laneResult.data?.reports_to_label ?? null,
        primary_location: laneResult.data?.primary_location ?? null,
        location_ids: visibleLocationIds,
      }];
    }

    const staffIds = canManage ? staffRows.map((row) => text(row.user_id)).filter(Boolean) : [auth.user.id];

    const planResult = staffIds.length
      ? await auth.admin
          .from("staff_checkin_plans")
          .select("id,staff_user_id,location_id,start_date,manager_user_id,status,created_at,updated_at")
          .eq("organization_id", auth.profile.organization_id)
          .in("staff_user_id", staffIds)
          .order("start_date", { ascending: false })
      : { data: [], error: null };
    if (planResult.error) throw planResult.error;

    const planIds = (planResult.data ?? []).map((row) => String(row.id));
    const checkinResult = planIds.length
      ? await auth.admin
          .from("staff_checkins")
          .select("id,plan_id,staff_user_id,location_id,milestone_days,due_date,status,employee_proud_of,employee_support_needed,employee_questions,employee_goal,employee_submitted_at,leadership_strengths,leadership_focus,leadership_support,leadership_next_goal,leadership_ratings,leadership_private_notes,reviewed_by,review_shared_at,employee_acknowledged_at,completed_at,updated_at")
          .eq("organization_id", auth.profile.organization_id)
          .in("plan_id", planIds)
          .order("due_date")
      : { data: [], error: null };
    if (checkinResult.error) throw checkinResult.error;

    const plans = (planResult.data ?? []).map((row) => ({
      id: String(row.id),
      staffUserId: String(row.staff_user_id),
      locationId: String(row.location_id),
      startDate: String(row.start_date),
      managerUserId: row.manager_user_id ? String(row.manager_user_id) : "",
      status: String(row.status),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }));

    const checkins = ((checkinResult.data ?? []) as unknown as DbRow[]).map((row) => ({
      id: text(row.id),
      planId: text(row.plan_id),
      staffUserId: text(row.staff_user_id),
      locationId: text(row.location_id),
      milestoneDays: Number(row.milestone_days),
      dueDate: text(row.due_date),
      status: text(row.status),
      employeeProudOf: text(row.employee_proud_of),
      employeeSupportNeeded: text(row.employee_support_needed),
      employeeQuestions: text(row.employee_questions),
      employeeGoal: text(row.employee_goal),
      employeeSubmittedAt: text(row.employee_submitted_at),
      leadershipStrengths: text(row.leadership_strengths),
      leadershipFocus: text(row.leadership_focus),
      leadershipSupport: text(row.leadership_support),
      leadershipNextGoal: text(row.leadership_next_goal),
      leadershipRatings: object(row.leadership_ratings),
      ...(canManage ? { leadershipPrivateNotes: text(row.leadership_private_notes) } : {}),
      reviewedBy: text(row.reviewed_by),
      reviewSharedAt: text(row.review_shared_at),
      employeeAcknowledgedAt: text(row.employee_acknowledged_at),
      completedAt: text(row.completed_at),
      updatedAt: text(row.updated_at),
    }));

    return Response.json({
      viewer: {
        userId: auth.user.id,
        fullName: auth.profile.full_name,
        role: auth.profile.role,
        canManage,
      },
      locations: (locationResult.data ?? []).map((row) => ({
        id: String(row.id),
        name: row.name || row.full_name || row.slug,
      })),
      staff: staffRows.map((row) => ({
        userId: text(row.user_id),
        fullName: text(row.full_name),
        email: text(row.email),
        role: text(row.role),
        jobTitle: text(row.job_title),
        secondaryTitle: text(row.secondary_title),
        reportsToLabel: text(row.reports_to_label),
        primaryLocation: text(row.primary_location),
        locationIds: Array.isArray(row.location_ids) ? row.location_ids : [],
        acceptedAt: text(row.accepted_at),
        createdAt: text(row.created_at),
      })),
      plans,
      checkins,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireStaff(request);
    const body = object(await request.json().catch(() => ({})));
    const action = text(body.action);

    if (action === "create_plan") {
      if (!auth.isOwner && !auth.isLicensee) throw new Response("Leadership access is required.", { status: 403 });
      const staffUserId = text(body.staffUserId);
      const locationId = text(body.locationId);
      const startDate = dateText(body.startDate);
      if (!staffUserId || !locationId || !startDate) {
        throw new Response("Employee, location, and employment start date are required.", { status: 400 });
      }

      await assertLeadershipLocation(auth, locationId);

      const assignment = await auth.admin
        .from("staff_location_assignments")
        .select("user_id")
        .eq("organization_id", auth.profile.organization_id)
        .eq("user_id", staffUserId)
        .eq("location_id", locationId)
        .maybeSingle();
      if (assignment.error) throw assignment.error;
      if (!assignment.data) throw new Response("That employee is not assigned to the selected location.", { status: 400 });

      const existing = await auth.admin
        .from("staff_checkin_plans")
        .select("id,status,start_date")
        .eq("organization_id", auth.profile.organization_id)
        .eq("staff_user_id", staffUserId)
        .eq("status", "Active")
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) {
        throw new Response(`This employee already has an active 30/60/90 plan starting ${existing.data.start_date}.`, { status: 409 });
      }

      const plan = await auth.admin
        .from("staff_checkin_plans")
        .insert({
          organization_id: auth.profile.organization_id,
          staff_user_id: staffUserId,
          location_id: locationId,
          start_date: startDate,
          manager_user_id: auth.user.id,
          status: "Active",
          created_by: auth.user.id,
          updated_by: auth.user.id,
        })
        .select("id")
        .single();
      if (plan.error) throw plan.error;

      const rows = [30, 60, 90].map((milestone) => ({
        organization_id: auth.profile.organization_id,
        plan_id: plan.data.id,
        staff_user_id: staffUserId,
        location_id: locationId,
        milestone_days: milestone,
        due_date: addDays(startDate, milestone),
        status: "Upcoming",
      }));
      const checkins = await auth.admin.from("staff_checkins").insert(rows);
      if (checkins.error) {
        await auth.admin.from("staff_checkin_plans").delete().eq("id", plan.data.id);
        throw checkins.error;
      }

      return Response.json({ ok: true, planId: plan.data.id, message: "30/60/90 employee check-in plan created." });
    }

    if (action === "employee_reflection") {
      const id = text(body.id);
      if (!id) throw new Response("Choose a check-in.", { status: 400 });
      const current = await checkinById(auth, id);
      if (String(current.staff_user_id) !== auth.user.id) {
        throw new Response("You can only submit your own employee reflection.", { status: 403 });
      }
      if (current.status === "Completed") throw new Response("This check-in is already completed.", { status: 409 });

      const proud = text(body.employeeProudOf).slice(0, 4000);
      const support = text(body.employeeSupportNeeded).slice(0, 4000);
      const questions = text(body.employeeQuestions).slice(0, 4000);
      const goal = text(body.employeeGoal).slice(0, 4000);
      if (!proud && !support && !questions && !goal) {
        throw new Response("Add at least one reflection before submitting.", { status: 400 });
      }

      const nextStatus = current.status === "Review Shared" ? "Review Shared" : "Employee Submitted";
      const result = await auth.admin
        .from("staff_checkins")
        .update({
          employee_proud_of: proud || null,
          employee_support_needed: support || null,
          employee_questions: questions || null,
          employee_goal: goal || null,
          employee_submitted_at: new Date().toISOString(),
          status: nextStatus,
        })
        .eq("id", id);
      if (result.error) throw result.error;
      return Response.json({ ok: true, message: "Your reflection was saved for the check-in." });
    }

    if (action === "manager_review") {
      if (!auth.isOwner && !auth.isLicensee) throw new Response("Leadership access is required.", { status: 403 });
      const id = text(body.id);
      if (!id) throw new Response("Choose a check-in.", { status: 400 });
      const current = await checkinById(auth, id);
      await assertLeadershipLocation(auth, String(current.location_id));

      const share = body.share === true;
      const strengths = text(body.leadershipStrengths).slice(0, 4000);
      const focus = text(body.leadershipFocus).slice(0, 4000);
      const support = text(body.leadershipSupport).slice(0, 4000);
      const nextGoal = text(body.leadershipNextGoal).slice(0, 4000);
      const privateNotes = text(body.leadershipPrivateNotes).slice(0, 6000);

      if (share && (!strengths || !focus || !support)) {
        throw new Response("Add strengths, focus areas, and TCS support before sharing the review.", { status: 400 });
      }

      const result = await auth.admin
        .from("staff_checkins")
        .update({
          leadership_strengths: strengths || null,
          leadership_focus: focus || null,
          leadership_support: support || null,
          leadership_next_goal: nextGoal || null,
          leadership_ratings: safeRatings(body.leadershipRatings),
          leadership_private_notes: privateNotes || null,
          reviewed_by: auth.user.id,
          status: share ? "Review Shared" : "Leadership Draft",
          review_shared_at: share ? new Date().toISOString() : null,
          employee_acknowledged_at: share ? null : undefined,
          completed_at: share ? null : undefined,
        })
        .eq("id", id);
      if (result.error) throw result.error;

      return Response.json({
        ok: true,
        message: share ? "Check-in review shared with the employee." : "Leadership draft saved.",
      });
    }

    if (action === "acknowledge") {
      const id = text(body.id);
      if (!id) throw new Response("Choose a check-in.", { status: 400 });
      const current = await checkinById(auth, id);
      if (String(current.staff_user_id) !== auth.user.id) {
        throw new Response("You can only acknowledge your own check-in.", { status: 403 });
      }
      if (current.status !== "Review Shared") {
        throw new Response("The leadership review must be shared before acknowledgment.", { status: 409 });
      }

      const now = new Date().toISOString();
      const result = await auth.admin
        .from("staff_checkins")
        .update({
          status: "Completed",
          employee_acknowledged_at: now,
          completed_at: now,
        })
        .eq("id", id);
      if (result.error) throw result.error;

      if (Number(current.milestone_days) === 90) {
        const plan = await planById(auth, String(current.plan_id));
        const planUpdate = await auth.admin
          .from("staff_checkin_plans")
          .update({ status: "Completed", updated_by: auth.user.id })
          .eq("id", plan.id);
        if (planUpdate.error) throw planUpdate.error;
      }

      return Response.json({ ok: true, message: "Check-in acknowledged and completed." });
    }

    return Response.json({ error: "Unsupported employee check-in action." }, { status: 400 });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireStaff(request);
    if (!auth.isOwner && !auth.isLicensee) throw new Response("Leadership access is required.", { status: 403 });
    const body = object(await request.json().catch(() => ({})));
    const action = text(body.action);

    if (action === "set_plan_status") {
      const planId = text(body.planId);
      const status = text(body.status);
      if (!planId || !["Active", "Paused", "Completed"].includes(status)) {
        throw new Response("Choose a valid plan and status.", { status: 400 });
      }
      const plan = await planById(auth, planId);
      await assertLeadershipLocation(auth, String(plan.location_id));
      const result = await auth.admin
        .from("staff_checkin_plans")
        .update({ status, updated_by: auth.user.id })
        .eq("id", planId);
      if (result.error) throw result.error;
      return Response.json({ ok: true, message: `30/60/90 plan marked ${status.toLowerCase()}.` });
    }

    return Response.json({ error: "Unsupported employee check-in action." }, { status: 400 });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
