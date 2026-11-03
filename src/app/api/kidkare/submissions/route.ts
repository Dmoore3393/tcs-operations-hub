import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";
import { tcsLocationSlug } from "@/lib/server/location-slug";
import { KIDKARE_CLAIM_DOCUMENT, kidKareToday, monthEnd, validClaimMonth, validKidKareDay } from "@/lib/kidkare-submissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { userClient, profile, isOwner, isLicensee } = await requireStaff(request);
    if (!isOwner && !isLicensee) return Response.json({ error: "KidKare is available to administration and licensees." }, { status: 403 });
    const month = new URL(request.url).searchParams.get("month");
    if (!validClaimMonth(month)) return Response.json({ error: "Choose a valid month." }, { status: 400 });
    const [locations, days, proofs] = await Promise.all([
      userClient.from("locations").select("id,slug,name,full_name,is_active").eq("organization_id", profile.organization_id).eq("program_type", "Family Childcare").order("name"),
      userClient.from("kidkare_daily_submissions").select("id,location_id,service_date,status,revision,updated_by_name,updated_at").eq("organization_id", profile.organization_id).gte("service_date", `${month}-01`).lte("service_date", monthEnd(month)).order("service_date"),
      userClient.from("document_records").select("id,location_id,original_filename,created_at,source_reference").eq("organization_id", profile.organization_id).eq("document_type", KIDKARE_CLAIM_DOCUMENT).eq("source_reference", month).eq("status", "Active").order("created_at", { ascending: false }),
    ]);
    for (const result of [locations, days, proofs]) if (result.error) throw new Error("KidKare submissions could not be loaded. Please try again.");
    // Omit retired duplicate location aliases while retaining closed homes for history.
    const homes = (locations.data ?? []).filter(home => home.slug === tcsLocationSlug(home.full_name));
    return Response.json({ homes, days: days.data ?? [], proofs: proofs.data ?? [], today: kidKareToday() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return staffErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const { userClient, isOwner, isLicensee } = await requireStaff(request);
    if (!isOwner && !isLicensee) return Response.json({ error: "Only administration and licensees can record KidKare submissions." }, { status: 403 });
    const body = await request.json().catch(() => null);
    if (!body || !validKidKareDay(body.date) || body.date > kidKareToday()
      || !["Submitted", "Closed / no care", "Not submitted"].includes(body.status)
      || typeof body.locationId !== "string" || !/^[a-f0-9-]{36}$/i.test(body.locationId)
      || !Number.isInteger(body.expectedRevision) || body.expectedRevision < 0) {
      return Response.json({ error: "Choose a home and a Monday–Friday date that is today or earlier." }, { status: 400 });
    }
    const { data, error } = await userClient.rpc("save_kidkare_submission", {
      p_location_id: body.locationId, p_service_date: body.date, p_status: body.status, p_expected_revision: body.expectedRevision,
    });
    if (error) return Response.json({ error: error.message }, { status: /changed/.test(error.message) ? 409 : 400 });
    return Response.json({ day: data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return staffErrorResponse(error); }
}
