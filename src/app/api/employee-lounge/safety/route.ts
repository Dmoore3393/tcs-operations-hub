import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";
import { LOUNGE_KEY, posts } from "@/lib/server/lounge-safety";
export const runtime = "nodejs";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function GET(request: Request) {
    try {
        const { admin, profile, user, isOwner } = await requireStaff(request);
        const blocks = await admin.from("lounge_blocks").select("blocked_user_id,blocked_name").eq("organization_id", profile.organization_id).eq("user_id", user.id);
        if (blocks.error)
            throw new Error("Could not load blocked authors.");
        const reports = isOwner ? await admin.from("lounge_reports").select("id,post_id,post_author,post_message,reason,status,created_at,reviewed_at").eq("organization_id", profile.organization_id).order("created_at", { ascending: false }).limit(200) : { data: [], error: null };
        if (reports.error)
            throw new Error("Could not load content reports.");
        return Response.json({ blocks: blocks.data ?? [], reports: reports.data ?? [], isOwner }, { headers: { "Cache-Control": "no-store" } });
    }
    catch (e) {
        return staffErrorResponse(e);
    }
}
export async function POST(request: Request) {
    try {
        const { admin, profile, user, isOwner } = await requireStaff(request);
        const body = await request.json().catch(() => ({}));
        const org = profile.organization_id;
        if (body.action === "resolve") {
            if (!isOwner)
                return Response.json({ error: "Owner/Admin access required." }, { status: 403 });
            if (!uuid.test(body.id ?? "") || !["Hidden", "Reviewed"].includes(body.status))
                return Response.json({ error: "Choose a valid report and resolution." }, { status: 400 });
            const r = await admin.from("lounge_reports").update({ status: body.status, reviewed_by: user.id, reviewed_at: new Date().toISOString() }).eq("organization_id", org).eq("id", body.id).select("id").maybeSingle();
            if (r.error)
                throw new Error("Could not resolve this report.");
            if (!r.data)
                return Response.json({ error: "Report not found." }, { status: 404 });
            return Response.json({ ok: true });
        }
        if (body.action === "unblock") {
            if (!uuid.test(body.userId ?? ""))
                return Response.json({ error: "Invalid author." }, { status: 400 });
            const r = await admin.from("lounge_blocks").delete().eq("organization_id", org).eq("user_id", user.id).eq("blocked_user_id", body.userId);
            if (r.error)
                throw new Error("Could not unblock this author.");
            return Response.json({ ok: true });
        }
        if (!["report", "block"].includes(body.action) || typeof body.postId !== "string")
            return Response.json({ error: "Choose a post and safety action." }, { status: 400 });
        const row = await admin.from("hub_state").select("state_value").eq("organization_id", org).eq("state_key", LOUNGE_KEY).maybeSingle();
        if (row.error)
            throw new Error("Could not find this post.");
        const post = posts(row.data?.state_value).find(p => p.id === body.postId);
        if (!post)
            return Response.json({ error: "Post not found in your organization." }, { status: 404 });
        if (body.action === "block") {
            if (!uuid.test(post.created_by ?? "") || post.created_by === user.id)
                return Response.json({ error: "This author cannot be blocked." }, { status: 400 });
            const r = await admin.from("lounge_blocks").upsert({ organization_id: org, user_id: user.id, blocked_user_id: post.created_by, blocked_name: post.from }, { onConflict: "organization_id,user_id,blocked_user_id" });
            if (r.error)
                throw new Error("Could not block this author.");
        }
        else {
            const reason = typeof body.reason === "string" ? body.reason.trim() : "";
            if (reason.length < 3 || reason.length > 1000)
                return Response.json({ error: "Explain the concern in 3–1,000 characters." }, { status: 400 });
            const r = await admin.from("lounge_reports").upsert({ organization_id: org, reporter_id: user.id, post_id: post.id, post_author: post.from, post_message: post.message, reason }, { onConflict: "organization_id,reporter_id,post_id", ignoreDuplicates: true });
            if (r.error)
                throw new Error("Could not submit this report.");
        }
        return Response.json({ ok: true });
    }
    catch (e) {
        return staffErrorResponse(e);
    }
}
