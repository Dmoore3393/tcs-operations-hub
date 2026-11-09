import { WORK_LOCATION_FILTER, normalizeLocation } from "@/lib/location-config";
import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";
import { scheduleDatePlus } from "@/lib/team-schedule";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await requireStaff(request);
    if (!auth.isOwner && !auth.isLicensee) throw new Response("Location licensee access is required.", { status: 403 });
    const params = new URL(request.url).searchParams;
    const weekOf = params.get("week") ?? "";
    const parsed = new Date(`${weekOf}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekOf) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== weekOf || parsed.getUTCDay() !== 1) {
      throw new Response("Choose a valid schedule week beginning Monday.", { status: 400 });
    }

    // Backup access is broader than a licensee's own team. Use the saved main
    // assignment, never the expanded list of backup locations, for this view.
    const primary = auth.profile.primary_location ?? (auth.profile.locations.length === 1 ? auth.profile.locations[0] : "");
    const primaryKey = normalizeLocation(primary);
    if (!auth.isOwner && primaryKey === "All Locations") throw new Response("Your main location needs to be set before viewing team schedules.", { status: 403 });
    const organizationId = auth.profile.organization_id;
    const sites = await auth.admin.from("locations")
      .select("id,slug,name,full_name,capacity,program_type")
      .eq("organization_id", organizationId).or(WORK_LOCATION_FILTER).order("name");
    if (sites.error) throw sites.error;
    const allowed = (sites.data ?? []).filter(site => auth.isOwner || normalizeLocation(site.slug || site.name) === primaryKey);
    const requested = params.get("location");
    const location = requested ? allowed.find(site => site.id === requested) : allowed[0];
    if (!location) throw new Response("This location is not assigned to your team schedule view.", { status: 403 });

    const published = await auth.admin.from("schedule_publications")
      .select("id,revision,published_at")
      .eq("organization_id", organizationId).eq("location_id", location.id)
      .eq("week_of", weekOf).eq("status", "Published")
      .order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (published.error) throw published.error;
    const publication = published.data;
    // Read only the current published snapshot. Draft edits must stay private
    // until administration publishes a new revision.
    const snapshots = publication ? await auth.admin.from("staff_schedule_publication_shifts")
      .select("id,location_id,user_id,staff_name,shift_date,start_time,end_time,position_label,notes")
      .eq("organization_id", organizationId).eq("location_id", location.id)
      .eq("publication_id", publication.id).eq("revision", publication.revision)
      .gte("shift_date", weekOf).lte("shift_date", scheduleDatePlus(weekOf, 6))
      .order("shift_date").order("start_time").order("staff_name") : { data: [], error: null };
    if (snapshots.error) throw snapshots.error;
    return Response.json({ weekOf, location, publication, shifts: (snapshots.data ?? []).map(shift => ({ ...shift, status: "Published" })) }, {
      headers: { "Cache-Control": "private, no-store", Vary: "Authorization" },
    });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
