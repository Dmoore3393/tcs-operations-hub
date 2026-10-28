import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";
import {
  newOnboardingItems,
  onboardingSummary,
  updateOnboardingItem,
  validOnboardingDate,
  type OnboardingPlan,
} from "@/lib/staff-onboarding";
export const runtime = "nodejs";
type Auth = Awaited<ReturnType<typeof requireStaff>>;
type Row = Record<string, unknown>;
const object = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
const text = (value: unknown, max = 200) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function fail(message: string, status = 400): never {
  throw new Response(message, { status });
}
const manager = (auth: Auth) => auth.isOwner || auth.isLicensee;
async function scope(auth: Auth) {
  let ids: string[] | null = null;
  if (!auth.isOwner) {
    const assignments = await auth.admin
      .from("staff_location_assignments")
      .select("location_id")
      .eq("organization_id", auth.profile.organization_id)
      .eq("user_id", auth.user.id);
    if (assignments.error) throw assignments.error;
    ids = (assignments.data ?? []).map((row) => String(row.location_id));
    if (!ids.length) return [];
  }
  let query = auth.admin
    .from("locations")
    .select("id,name,full_name")
    .eq("organization_id", auth.profile.organization_id)
    .eq("is_active", true);
  if (ids) query = query.in("id", ids);
  const result = await query.order("name");
  if (result.error) throw result.error;
  return (result.data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.full_name || row.name),
  }));
}
async function linkedStaff(auth: Auth, userId: string, locationId: string) {
  if (!uuid.test(userId)) fail("Choose an existing staff account.");
  const [staff, assignment] = await Promise.all([
    auth.admin
      .from("staff_access")
      .select("user_id,full_name")
      .eq("organization_id", auth.profile.organization_id)
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle(),
    auth.admin
      .from("staff_location_assignments")
      .select("user_id")
      .eq("organization_id", auth.profile.organization_id)
      .eq("user_id", userId)
      .eq("location_id", locationId)
      .maybeSingle(),
  ]);
  if (staff.error) throw staff.error;
  if (assignment.error) throw assignment.error;
  if (!staff.data || !assignment.data)
    fail("That account is not active at the selected location.");
  return staff.data;
}
async function loadPlan(auth: Auth, id: string) {
  if (!uuid.test(id)) fail("Choose an onboarding record.");
  let query = auth.admin
    .from("staff_onboarding_plans")
    .select("*")
    .eq("organization_id", auth.profile.organization_id)
    .eq("id", id);
  if (!manager(auth)) query = query.eq("staff_user_id", auth.user.id);
  const result = await query.maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) fail("Onboarding record not found.", 404);
  const plan = result.data as OnboardingPlan;
  if (
    manager(auth) &&
    !(await scope(auth)).some((loc) => loc.id === plan.location_id)
  )
    fail("Location access is required.", 403);
  return plan;
}
async function bodyOf(request: Request) {
  const source = await request.text();
  if (source.length > 12000) fail("This update is too large.", 413);
  try {
    const body = object(JSON.parse(source));
    if (!Object.keys(body).length) fail("Enter the onboarding details.");
    return body;
  } catch (error) {
    if (error instanceof Response) throw error;
    fail("The request could not be read.");
  }
}
function responseError(error: unknown) {
  if (object(error).code === "23505")
    return Response.json(
      {
        error:
          "An active onboarding record already uses that email or linked account. Open the existing record or archive it first.",
      },
      { status: 409 },
    );
  return staffErrorResponse(error);
}
export async function GET(request: Request) {
  try {
    const auth = await requireStaff(request),
      canManage = manager(auth),
      locations = await scope(auth);
    const url = new URL(request.url),
      page = Math.max(
        0,
        Math.min(100, Math.floor(Number(url.searchParams.get("page")) || 0)),
      );
    let query = auth.admin
      .from("staff_onboarding_plans")
      .select("*")
      .eq("organization_id", auth.profile.organization_id)
      .eq(
        "status",
        url.searchParams.get("archived") === "true" ? "Archived" : "Active",
      );
    if (canManage) {
      if (!locations.length)
        return Response.json({
          plans: [],
          locations: [],
          staff: [],
          canManage,
          nextPage: null,
        });
      query = query.in(
        "location_id",
        locations.map((loc) => loc.id),
      );
    } else query = query.eq("staff_user_id", auth.user.id);
    const result = await query
      .order("start_date", { ascending: false })
      .order("id")
      .range(page * 100, page * 100 + 99);
    if (result.error) throw result.error;
    let staff: Array<{
      userId: string;
      fullName: string;
      locationIds: string[];
    }> = [];
    if (canManage && locations.length) {
      const assignments = await auth.admin
        .from("staff_location_assignments")
        .select("user_id,location_id")
        .eq("organization_id", auth.profile.organization_id)
        .in(
          "location_id",
          locations.map((loc) => loc.id),
        );
      if (assignments.error) throw assignments.error;
      const ids = [
        ...new Set((assignments.data ?? []).map((row) => String(row.user_id))),
      ];
      if (ids.length) {
        const accounts = await auth.admin
          .from("staff_access")
          .select("user_id,full_name")
          .eq("organization_id", auth.profile.organization_id)
          .eq("is_active", true)
          .in("user_id", ids)
          .order("full_name");
        if (accounts.error) throw accounts.error;
        staff = (accounts.data ?? []).map((row) => ({
          userId: String(row.user_id),
          fullName: String(row.full_name),
          locationIds: (assignments.data ?? [])
            .filter((a) => a.user_id === row.user_id)
            .map((a) => String(a.location_id)),
        }));
      }
    }
    return Response.json(
      {
        plans: result.data ?? [],
        locations,
        staff,
        canManage,
        nextPage: result.data?.length === 100 ? page + 1 : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return responseError(error);
  }
}
export async function POST(request: Request) {
  try {
    const auth = await requireStaff(request);
    if (!manager(auth)) fail("Leadership access is required.", 403);
    const body = await bodyOf(request),
      id = text(body.id),
      fullName = text(body.fullName, 160),
      email = text(body.email, 254).toLowerCase(),
      jobTitle = text(body.jobTitle, 160),
      startDate = text(body.startDate),
      locationId = text(body.locationId),
      staffId = text(body.staffUserId),
      supervisor = text(body.supervisor, 160) || auth.profile.full_name;
    if (
      !uuid.test(id) ||
      !fullName ||
      !jobTitle ||
      !validOnboardingDate(startDate)
    )
      fail(
        "Name, role, location and a valid employment start date are required.",
      );
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      fail("Enter a valid email or leave it blank until confirmed.");
    if (!(await scope(auth)).some((loc) => loc.id === locationId))
      fail("Choose an assigned, active location.", 403);
    if (staffId) await linkedStaff(auth, staffId, locationId);
    const existing = await auth.admin
      .from("staff_onboarding_plans")
      .select(
        "id,created_by,full_name,location_id,email,job_title,start_date,supervisor,staff_user_id",
      )
      .eq("organization_id", auth.profile.organization_id)
      .eq("id", id)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) {
      if (
        existing.data.created_by !== auth.user.id ||
        existing.data.full_name !== fullName ||
        existing.data.location_id !== locationId ||
        existing.data.email !== email ||
        existing.data.job_title !== jobTitle ||
        existing.data.start_date !== startDate ||
        existing.data.supervisor !== supervisor ||
        (existing.data.staff_user_id || "") !== staffId
      )
        fail("This creation request changed. Reload before retrying.", 409);
      return Response.json({ ok: true, id });
    }
    const result = await auth.admin
      .from("staff_onboarding_plans")
      .insert({
        id,
        organization_id: auth.profile.organization_id,
        location_id: locationId,
        staff_user_id: staffId || null,
        full_name: fullName,
        email,
        job_title: jobTitle,
        start_date: startDate,
        supervisor,
        items: newOnboardingItems(startDate, supervisor),
        created_by: auth.user.id,
        updated_by: auth.user.id,
      })
      .select("id")
      .single();
    if (result.error) throw result.error;
    return Response.json({ ok: true, id: result.data.id }, { status: 201 });
  } catch (error) {
    return responseError(error);
  }
}
export async function PATCH(request: Request) {
  try {
    const auth = await requireStaff(request),
      body = await bodyOf(request),
      plan = await loadPlan(auth, text(body.id)),
      canManage = manager(auth),
      action = text(body.action);
    if (text(body.expectedUpdatedAt) !== plan.updated_at)
      fail(
        "This checklist changed. Reload it before saving so another person's work is kept.",
        409,
      );
    const patch: Row = { updated_by: auth.user.id };
    if (action === "item") {
      if (plan.status !== "Active")
        fail("Restore this record before changing its checklist.", 409);
      const index = plan.items.findIndex(
        (item) => item.id === text(body.itemId),
      );
      if (index < 0) fail("Checklist item not found.", 404);
      try {
        patch.items = plan.items.map((item, i) =>
          i === index
            ? updateOnboardingItem(
                item,
                object(body.item),
                canManage,
                auth.profile.full_name,
                new Date().toISOString(),
              )
            : item,
        );
      } catch (error) {
        fail(
          error instanceof Error ? error.message : "Check the item details.",
        );
      }
      patch.reviewed_at = null;
      patch.reviewed_by = null;
    } else if (action === "link") {
      if (!canManage) fail("Leadership access is required.", 403);
      const staffId = text(body.staffUserId);
      if (staffId) await linkedStaff(auth, staffId, plan.location_id);
      patch.staff_user_id = staffId || null;
      patch.reviewed_at = null;
      patch.reviewed_by = null;
    } else if (action === "details") {
      if (!canManage) fail("Leadership access is required.", 403);
      if (plan.status !== "Active")
        fail("Restore this record before editing its details.", 409);
      const fullName = text(body.fullName, 160),
        email = text(body.email, 254).toLowerCase(),
        jobTitle = text(body.jobTitle, 160),
        startDate = text(body.startDate),
        locationId = text(body.locationId),
        supervisor = text(body.supervisor, 160);
      if (
        !fullName ||
        !jobTitle ||
        !supervisor ||
        !validOnboardingDate(startDate)
      )
        fail("Enter a name, role, supervisor and valid start date.");
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        fail("Enter a valid email or leave it blank.");
      if (!(await scope(auth)).some((loc) => loc.id === locationId))
        fail("Choose an assigned, active location.", 403);
      if (plan.staff_user_id)
        await linkedStaff(auth, plan.staff_user_id, locationId);
      Object.assign(patch, {
        full_name: fullName,
        email,
        job_title: jobTitle,
        start_date: startDate,
        location_id: locationId,
        supervisor,
        reviewed_at: null,
        reviewed_by: null,
      });
      if (body.resetPendingDates === true && startDate !== plan.start_date) {
        const defaults = new Map(
          newOnboardingItems(startDate, supervisor).map((item) => [
            item.id,
            item.dueDate,
          ]),
        );
        patch.items = plan.items.map((item) =>
          item.status === "Pending"
            ? { ...item, dueDate: defaults.get(item.id) || item.dueDate }
            : item,
        );
      }
    } else if (action === "review") {
      if (!canManage)
        fail("Only leadership can record the final checklist review.", 403);
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Los_Angeles",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      if (
        plan.status !== "Active" ||
        !onboardingSummary(plan.items, today).readyForReview
      )
        fail(
          "Verify every checklist item or record why it does not apply before completing leadership review.",
        );
      patch.reviewed_at = new Date().toISOString();
      patch.reviewed_by = auth.profile.full_name;
    } else if (action === "archive" || action === "restore") {
      if (!canManage) fail("Leadership access is required.", 403);
      patch.status = action === "archive" ? "Archived" : "Active";
    } else fail("Choose a valid onboarding action.");
    const result = await auth.admin
      .from("staff_onboarding_plans")
      .update(patch)
      .eq("organization_id", auth.profile.organization_id)
      .eq("id", plan.id)
      .eq("updated_at", plan.updated_at)
      .select("id")
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data)
      fail(
        "Another save completed first. Reload this checklist and try again.",
        409,
      );
    return Response.json({ ok: true });
  } catch (error) {
    return responseError(error);
  }
}
