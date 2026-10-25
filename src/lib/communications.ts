export type TeamReply = { id: string; thread_id: string; author_id: string | null; author_name: string; body: string; created_at: string };
export type TeamReceipt = { thread_id: string; user_id: string; staff_name: string; read_at: string; acknowledged_at: string | null };
export type TeamThread = {
  id: string; organization_id: string; location_id: string | null; title: string; body: string;
  author_id: string | null; author_name: string; pinned: boolean; requires_ack: boolean; created_at: string;
  replies: TeamReply[]; receipts: TeamReceipt[];
};
export type TeamCommunicationsPayload = {
  threads: TeamThread[]; locations: Array<{ id: string; name: string; slug: string }>;
  canManage: boolean; canPostAll: boolean; hasMore: boolean; nextBefore: string | null;
};
export function latestThreadTime(thread: TeamThread) {
  return Math.max(Date.parse(thread.created_at) || 0, ...thread.replies.map((reply) => Date.parse(reply.created_at) || 0));
}
export function threadIsUnread(thread: TeamThread, userId: string) {
  const own = thread.receipts.find((receipt) => receipt.user_id === userId);
  const incoming = Math.max(thread.author_id === userId ? 0 : Date.parse(thread.created_at) || 0, ...thread.replies.filter((reply) => reply.author_id !== userId).map((reply) => Date.parse(reply.created_at) || 0));
  return incoming > 0 && (!own || (Date.parse(own.read_at) || 0) < incoming);
}
export function threadNeedsAcknowledgment(thread: TeamThread, userId: string) {
  return thread.requires_ack && !thread.receipts.some((receipt) => receipt.user_id === userId && receipt.acknowledged_at);
}
export function visibleTeamThreads(threads: TeamThread[], query: string, filter: string, userId: string, locationId = "") {
  const search = query.trim().toLowerCase();
  return threads.filter((thread) => (!locationId || !thread.location_id || thread.location_id === locationId)
    && (!search || [thread.title, thread.body, thread.author_name, ...thread.replies.map((reply) => reply.body)].join(" ").toLowerCase().includes(search))
    && (filter !== "unread" || threadIsUnread(thread, userId))
    && (filter !== "acknowledge" || threadNeedsAcknowledgment(thread, userId))
    && (filter !== "pinned" || thread.pinned))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || latestThreadTime(b) - latestThreadTime(a));
}
export function communicationStamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function newCommunicationId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Works in older WebViews and HTTP development previews, too.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
