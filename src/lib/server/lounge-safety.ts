import "server-only";
import type { AuthorizedStaff } from "@/lib/server/require-staff";
export const LOUNGE_KEY = "tcs-employee-lounge-shoutouts-v1";
export type LoungePost = {
    id: string;
    from: string;
    message: string;
    created_by: string;
    created_at: string;
};
export function posts(value: unknown): LoungePost[] {
    if (!Array.isArray(value))
        return [];
    return value.filter((p): p is LoungePost => Boolean(p) && typeof p === "object" && typeof p.id === "string" && typeof p.message === "string");
}
export async function visiblePosts(staff: AuthorizedStaff, value: unknown) {
    const { admin, profile, user } = staff;
    const [blocks, reports] = await Promise.all([
        admin.from("lounge_blocks").select("blocked_user_id").eq("organization_id", profile.organization_id).eq("user_id", user.id),
        admin.from("lounge_reports").select("post_id,reporter_id,status").eq("organization_id", profile.organization_id),
    ]);
    if (blocks.error || reports.error)
        throw new Error("Could not apply Lounge safety settings.");
    const blocked = new Set((blocks.data ?? []).map(p => p.blocked_user_id));
    const hidden = new Set((reports.data ?? []).filter(p => p.status === "Hidden" || (p.reporter_id === user.id && p.status === "Pending")).map(p => p.post_id));
    return posts(value).filter(p => !blocked.has(p.created_by) && !hidden.has(p.id));
}
export function prohibitedText(message: string) {
    return /\b(fuck(?:ing|ed|er)?|shit|bitch(?:es)?|cunt|nigger|faggot|kill yourself)\b/i.test(message);
}
