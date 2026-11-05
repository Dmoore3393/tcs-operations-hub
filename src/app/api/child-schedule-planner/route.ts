import { dayNames } from "@/lib/location-config";
import { validatePlanBlocks } from "@/lib/weekly-care-planner";
import { canApproveChildSchedules } from "@/lib/child-schedule-authority";
import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";

export async function POST(request: Request) {
  try {
    const { admin, user, profile } = await requireStaff(request);
    if (!canApproveChildSchedules(profile))
      return Response.json({ error: "Schedule editing access is required." }, { status: 403 });
    const body = await request.json();
    const org = profile.organization_id;
    if (body.kind === "school-notes") {
      const { locationId, date, noSchool, minimumDay, version } = body;
      if (
        typeof locationId !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        typeof noSchool !== "string" ||
        typeof minimumDay !== "string" ||
        noSchool.length > 160 ||
        minimumDay.length > 160
      ) {
        return Response.json(
          { error: "Enter a location, date and school names of up to 160 characters." },
          { status: 400 },
        );
      }
      const auth = await admin.rpc("authorized_care_reviewer", {
        p_actor: user.id,
        p_org: org,
        p_location: locationId,
      });
      if (auth.error) throw new Error(auth.error.message);
      if (!auth.data)
        return Response.json({ error: "You cannot edit school notes at this site." }, { status: 403 });
      const values = {
        no_school: noSchool.trim(),
        minimum_day: minimumDay.trim(),
        updated_at: new Date().toISOString(),
      };
      const table = admin.from("child_schedule_school_notes");
      const result = version
        ? await table
            .update(values)
            .eq("organization_id", org)
            .eq("location_id", locationId)
            .eq("service_date", date)
            .eq("updated_at", version)
            .select("updated_at")
            .maybeSingle()
        : await table
            .insert({ ...values, organization_id: org, location_id: locationId, service_date: date })
            .select("updated_at")
            .single();
      if (result.error?.code === "23505" || (!result.error && !result.data)) {
        return Response.json(
          { error: "School notes changed. Reopen them to use the latest version." },
          { status: 409 },
        );
      }
      if (result.error) throw new Error(result.error.message);
      return Response.json({ saved: true });
    }
    if (body.kind === "usual-hours") {
      if (typeof body.childId !== "string" || !body.days || Object.keys(body.days).length !== 7)
        return Response.json({ error: "Choose a child and a full week." }, { status: 400 });
      for (const day of dayNames) {
        const entry = body.days[day];
        if (
          !entry ||
          typeof entry.noCare !== "boolean" ||
          typeof entry.note !== "string" ||
          entry.note.length > 500 ||
          !Array.isArray(entry.blocks) ||
          entry.blocks.length > 12 ||
          (entry.noCare && entry.blocks.length)
        )
          return Response.json({ error: `Review the hours and note for ${day}.` }, { status: 400 });
        if (!entry.noCare) {
          const issue = validatePlanBlocks(
            entry.blocks.map((b: { location: string; start: string; end: string }) => ({
              locationId: b.location,
              start: b.start,
              end: b.end,
            })),
          );
          if (issue) return Response.json({ error: `${day}: ${issue}` }, { status: 400 });
        }
      }
      const result = await admin.rpc("save_child_planner_template", {
        p_org: org,
        p_actor: user.id,
        p_child: body.childId,
        p_days: body.days,
        p_version: body.version,
      });
      if (result.error)
        return Response.json(
          { error: result.error.message },
          { status: result.error.code === "42501" ? 403 : result.error.code === "40001" ? 409 : 400 },
        );
      return Response.json({ saved: true });
    }
    if (
      body.kind !== "days" ||
      typeof body.childId !== "string" ||
      !Array.isArray(body.dates) ||
      !Array.isArray(body.blocks) ||
      typeof body.note !== "string"
    ) {
      return Response.json({ error: "Choose the child and dates to save." }, { status: 400 });
    }
    const { error } = await admin.rpc("save_child_planner_days", {
      p_org: org,
      p_actor: user.id,
      p_child: body.childId,
      p_dates: body.dates,
      p_status: body.status,
      p_blocks: body.blocks,
      p_note: body.note.trim(),
    });
    if (error) {
      const status = error.code === "42501" ? 403 : error.code === "40001" ? 409 : 400;
      return Response.json({ error: error.message }, { status });
    }
    return Response.json({ saved: true });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
