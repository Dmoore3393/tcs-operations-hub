import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";
import { isSupportedAccessRole } from "@/lib/team-access";
import { uuidPattern } from "@/lib/communications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

async function requireCommunicationsStaff(request: Request) {
  const staff = await requireStaff(request);
  if (!isSupportedAccessRole(staff.profile.role)) throw new Response("Active TCS staff access is required.", { status: 403 });
  return staff;
}

export async function GET(request: Request) {
  try {
    const { userClient, profile, isOwner, isLicensee } = await requireCommunicationsStaff(request);
    const before = new URL(request.url).searchParams.get("before");
    let query = userClient.from("hub_team_threads").select("id,organization_id,location_id,title,body,author_id,author_name,pinned,requires_ack,created_at")
      .eq("organization_id", profile.organization_id).order("pinned", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(51);
    // Keyset pagination remains deterministic when posts have the same timestamp.
    if (before) {
      const [pin, stamp, id] = before.split("|");
      if (!["0", "1"].includes(pin) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(stamp || "") || Number.isNaN(Date.parse(stamp)) || !uuidPattern.test(id || "")) throw new Response("Invalid conversation cursor.", { status: 400 });
      const older = `or(created_at.lt.${stamp},and(created_at.eq.${stamp},id.lt.${id}))`;
      query = query.or(pin === "1" ? `pinned.eq.false,and(pinned.eq.true,${older})` : `and(pinned.eq.false,${older})`);
    }
    const [posts, locations, activity] = await Promise.all([
      query,
      userClient.from("locations").select("id,name,slug").eq("organization_id", profile.organization_id).eq("is_active", true).order("name"),
      before ? Promise.resolve({ data: [], error: null }) : userClient.from("hub_team_replies").select("thread_id").order("created_at", { ascending: false }).limit(50),
    ]);
    if (posts.error) throw posts.error;
    if (locations.error) throw locations.error;
    if (activity.error) throw activity.error;
    const threads = (posts.data ?? []).slice(0, 50);
    // Bring an older conversation back when it receives a new reply.
    const activeIds = [...new Set((activity.data ?? []).map((reply) => reply.thread_id))].filter((id) => !threads.some((thread) => thread.id === id));
    if (activeIds.length) {
      const active = await userClient.from("hub_team_threads").select("id,organization_id,location_id,title,body,author_id,author_name,pinned,requires_ack,created_at").eq("organization_id", profile.organization_id).in("id", activeIds);
      if (active.error) throw active.error;
      threads.push(...(active.data ?? []));
    }
    const ids = threads.map((thread) => thread.id);
    const [replies, receipts] = ids.length ? await Promise.all([
      userClient.from("hub_team_replies").select("id,thread_id,author_id,author_name,body,created_at").in("thread_id", ids).order("created_at", { ascending: false }).limit(1000),
      userClient.from("hub_team_receipts").select("thread_id,user_id,staff_name,read_at,acknowledged_at").in("thread_id", ids).limit(5000),
    ]) : [{ data: [], error: null }, { data: [], error: null }];
    if (replies.error) throw replies.error;
    if (receipts.error) throw receipts.error;
    const last = (posts.data ?? []).slice(0, 50).at(-1);
    return Response.json({
      threads: threads.map((thread) => ({ ...thread, replies: (replies.data ?? []).filter((item) => item.thread_id === thread.id).reverse(), receipts: (receipts.data ?? []).filter((item) => item.thread_id === thread.id) })),
      locations: locations.data ?? [], canManage: isOwner || isLicensee, canPostAll: isOwner,
      hasMore: (posts.data?.length ?? 0) > 50, nextBefore: last ? `${last.pinned ? "1" : "0"}|${last.created_at}|${last.id}` : null,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return staffErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const { userClient, user, profile, isOwner, isLicensee } = await requireCommunicationsStaff(request);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Response("Enter a valid communication request.", { status: 400 });
    const id = clean(body.id, 36);
    if (!uuidPattern.test(id)) throw new Response("A valid message ID is required.", { status: 400 });
    if (body.action === "reply") {
      const threadId = clean(body.threadId, 36), text = clean(body.body, 5000);
      if (!uuidPattern.test(threadId) || !text) throw new Response("Choose a conversation and enter a reply.", { status: 400 });
      const result = await userClient.from("hub_team_replies").upsert({ id, thread_id: threadId, author_id: user.id, author_name: profile.full_name, body: text }, { onConflict: "id", ignoreDuplicates: true });
      if (result.error) throw result.error;
    } else if (body.action === "post") {
      const title = clean(body.title, 160), text = clean(body.body, 5000);
      const locationId = body.locationId ? clean(body.locationId, 36) : null;
      if (!title || !text || (locationId && !uuidPattern.test(locationId))) throw new Response("Enter a title, message and valid audience.", { status: 400 });
      if (!locationId && !isOwner) throw new Response("Only Owner/Admin can post to all TCS locations.", { status: 403 });
      if ((body.pinned || body.requiresAck) && !(isOwner || isLicensee)) throw new Response("Only your location leadership can pin announcements or require acknowledgment.", { status: 403 });
      const result = await userClient.from("hub_team_threads").upsert({
        id, organization_id: profile.organization_id, location_id: locationId, title, body: text,
        author_id: user.id, author_name: profile.full_name, pinned: Boolean(body.pinned), requires_ack: Boolean(body.requiresAck),
      }, { onConflict: "id", ignoreDuplicates: true });
      if (result.error) throw result.error;
    } else { throw new Response("Choose a supported communication action.", { status: 400 }); }
    return Response.json({ ok: true });
  } catch (error) { return staffErrorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const { userClient, isOwner, isLicensee } = await requireCommunicationsStaff(request);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Response("Enter a valid communication request.", { status: 400 });
    const threadId = clean(body.threadId, 36);
    if (!uuidPattern.test(threadId)) throw new Response("Choose a valid conversation.", { status: 400 });
    if (body.action === "pin") {
      if (!(isOwner || isLicensee)) throw new Response("Location leadership is required.", { status: 403 });
      const result = await userClient.from("hub_team_threads").update({ pinned: Boolean(body.pinned) }).eq("id", threadId).select("id").maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) throw new Response("This conversation is no longer available to your account.", { status: 404 });
    } else if (body.action === "read" || body.action === "acknowledge") {
      const seenAt = clean(body.seenAt, 50);
      if (Number.isNaN(Date.parse(seenAt))) throw new Response("Refresh the conversation before marking it read.", { status: 400 });
      const result = await userClient.rpc("hub_read_team_thread", { p_thread: threadId, p_ack: body.action === "acknowledge", p_seen_at: seenAt });
      if (result.error) throw result.error;
    } else { throw new Response("Choose a supported communication action.", { status: 400 }); }
    return Response.json({ ok: true });
  } catch (error) { return staffErrorResponse(error); }
}
