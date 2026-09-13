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

    return Response.json({
      ok: true,
      event,
      occurredAt: new Date().toISOString(),
      location: requested,
    });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
