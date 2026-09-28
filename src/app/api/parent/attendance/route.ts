import { scryptSync, timingSafeEqual } from "node:crypto";
import { parentErrorResponse, requireParent } from "@/lib/server/require-parent";
import { locationFromSlug, locationThemes } from "@/lib/location-config";

type DbRow = Record<string, unknown>;

function object(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DbRow : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function pacificDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function verifyPin(pin: string, digest: string) {
  if (!pin || !digest) return false;
  const [saltText, hashText] = digest.split(".");
  if (!saltText || !hashText) return false;

  try {
    const salt = Buffer.from(saltText, "base64url");
    const expected = Buffer.from(hashText, "base64url");
    const actual = scryptSync(pin, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

async function resolveLocation(
  admin: Awaited<ReturnType<typeof requireParent>>["admin"],
  organizationId: string,
  slug: string,
) {
  const locationKey = locationFromSlug(slug);
  if (!locationKey) throw new Response("This location QR code is not valid.", { status: 404 });

  const result = await admin
    .from("locations")
    .select("id,slug,name,full_name,is_active")
    .eq("organization_id", organizationId)
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (result.error) throw result.error;
  if (!result.data) throw new Response("This TCS location is not currently active.", { status: 404 });

  return {
    id: String(result.data.id),
    slug: String(result.data.slug),
    name: String(result.data.name || locationKey),
    fullName: String(result.data.full_name || locationThemes[locationKey].fullName),
  };
}

export async function GET(request: Request) {
  try {
    const { admin, children } = await requireParent(request);
    const url = new URL(request.url);
    const slug = url.searchParams.get("location")?.trim().toLowerCase() || "";
    const organizationId = children[0]?.organizationId || "";
    if (!organizationId) throw new Response("Your family account is not linked to a TCS organization.", { status: 403 });
    const location = await resolveLocation(admin, organizationId, slug);

    return Response.json({
      location,
      children: children
        .filter((child) => child.access.permissions.managePickup)
        .map((child) => ({
          id: child.legacyId,
          name: `${text(child.record.firstName)} ${text(child.record.lastName)}`.trim(),
          homeLocation: text(child.record.location),
          attendanceToday: text(child.record.attendanceToday),
          attendanceDate: text(child.record.attendanceDate),
          attendanceLocation: text(child.record.attendanceLocation),
          checkedInAt: text(child.record.checkedInAt),
          checkedOutAt: text(child.record.checkedOutAt),
          attendancePinConfigured: Boolean(text(child.record.pickupPinDigest)),
        })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return parentErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { admin, user, email, children } = await requireParent(request);
    const body = object(await request.json().catch(() => ({})));
    const slug = text(body.location).toLowerCase();
    const action = text(body.action);
    const pin = text(body.pin);
    const childIds = Array.isArray(body.childIds)
      ? body.childIds.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean)
      : [];

    if (!["checkin", "checkout"].includes(action)) {
      throw new Response("Choose Check In or Check Out.", { status: 400 });
    }
    if (!/^\d{4,6}$/.test(pin)) {
      throw new Response("Enter your 4–6 digit family attendance PIN.", { status: 400 });
    }
    if (!childIds.length) {
      throw new Response("Choose at least one child.", { status: 400 });
    }

    const organizationId = children[0]?.organizationId || "";
    if (!organizationId) throw new Response("Your family account is not linked to a TCS organization.", { status: 403 });
    const location = await resolveLocation(admin, organizationId, slug);
    const selected = children.filter((child) =>
      childIds.includes(child.legacyId) && child.access.permissions.managePickup,
    );

    if (selected.length !== childIds.length) {
      throw new Response("One or more selected children are not available to this Parent Portal account.", { status: 403 });
    }

    if (selected.some((child) => child.organizationId !== organizationId)) {
      throw new Response("Selected children must belong to the same TCS organization.", { status: 403 });
    }

    const today = pacificDate();
    if (action === "checkout") {
      const notPresent = selected.find((child) =>
        text(child.record.attendanceDate) !== today || text(child.record.attendanceToday) !== "Present"
      );
      if (notPresent) {
        throw new Response(`${text(notPresent.record.firstName) || "A selected child"} is not currently checked in today.`, { status: 409 });
      }
    }

    for (const child of selected) {
      const digest = text(child.record.pickupPinDigest);
      if (!digest) {
        throw new Response("Set your Family Attendance PIN in the Parent Portal before using location QR check-in.", { status: 400 });
      }
      if (!verifyPin(pin, digest)) {
        throw new Response("That Family Attendance PIN did not match.", { status: 403 });
      }
    }

    const now = new Date().toISOString();
    const date = today;
    const results = [];

    for (const child of selected) {
      const currentResult = await admin
        .from("children")
        .select("id,organization_id,location_id,first_name,last_name,record_data,attendance_status")
        .eq("id", child.rowId)
        .maybeSingle();

      if (currentResult.error) throw currentResult.error;
      if (!currentResult.data) continue;

      const record = object(currentResult.data.record_data);
      const next: DbRow = { ...record };
      const adultName = child.access.name || email;

      if (action === "checkin") {
        next.attendanceToday = "Present";
        next.attendanceDate = date;
        next.checkedInAt = now;
        next.checkedInBy = `Parent: ${adultName}`;
        next.checkedOutAt = "";
        next.checkedOutBy = "";
        next.pickupPerson = "";
        next.pickupVerification = "Not Applicable";
        next.pickupNotes = "";
      } else {
        next.attendanceToday = "Checked Out";
        next.attendanceDate = date;
        next.checkedOutAt = now;
        next.checkedOutBy = `Parent: ${adultName}`;
        next.pickupPerson = adultName;
        next.pickupVerification = "Parent QR + PIN";
        next.pickupNotes = "";
      }

      next.attendanceLocation = location.name;
      next.attendanceLocationId = location.id;
      next.attendanceLocationSource = "Location QR";

      const status = action === "checkin" ? "Present" : "Checked Out";
      const update = await admin
        .from("children")
        .update({
          attendance_status: status,
          record_data: next,
          updated_by: user.id,
        })
        .eq("id", child.rowId)
        .select("id")
        .maybeSingle();

      if (update.error) throw update.error;
      if (!update.data) throw new Error("The attendance change was not returned.");

      const existingSession = await admin
        .from("child_attendance_sessions")
        .select("id,check_in_at")
        .eq("organization_id", child.organizationId)
        .eq("child_id", child.rowId)
        .eq("attendance_date", date)
        .maybeSingle();

      if (existingSession.error) throw existingSession.error;

      const childName = [text(currentResult.data.first_name), text(currentResult.data.last_name)].filter(Boolean).join(" ");
      const sessionPayload = {
        organization_id: child.organizationId,
        location_id: location.id,
        child_id: child.rowId,
        child_name: childName,
        attendance_date: date,
        check_in_at: action === "checkin"
          ? now
          : (existingSession.data?.check_in_at ?? (text(record.checkedInAt) || null)),
        check_out_at: action === "checkout" ? now : null,
        status: action === "checkin" ? "Checked In" : "Checked Out",
        source: "Parent QR",
        notes: action === "checkout" ? "Parent QR + PIN" : `Checked in at ${location.name}`,
      };

      const sessionResult = existingSession.data?.id
        ? await admin.from("child_attendance_sessions").update(sessionPayload).eq("id", existingSession.data.id)
        : await admin.from("child_attendance_sessions").insert(sessionPayload);

      if (sessionResult.error) throw sessionResult.error;

      await admin.from("audit_log").insert({
        organization_id: child.organizationId,
        location_id: location.id,
        actor_user_id: user.id,
        action: "UPDATE",
        table_name: "children",
        row_id: child.rowId,
        metadata: {
          kind: "parent_qr_attendance",
          action,
          childId: child.legacyId,
          location: location.name,
          authenticatedParentEmail: email,
        },
      });

      results.push({
        childId: child.legacyId,
        name: childName,
        status,
        location: location.name,
        at: now,
      });
    }

    return Response.json({ ok: true, results });
  } catch (error) {
    return parentErrorResponse(error);
  }
}
