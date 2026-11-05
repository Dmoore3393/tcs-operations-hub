import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { HubNotification, HubNotificationPreferences } from "@/lib/notifications";

const TABLE = "user_notification_state";
const MAX_NOTIFICATIONS = 100;

function inboxEntries(raw: unknown): HubNotification[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is HubNotification =>
    Boolean(item) && typeof item === "object" && typeof item.id === "string",
  ).slice(0, MAX_NOTIFICATIONS);
}

export async function loadStoredNotificationState(
  admin: SupabaseClient,
  user: User,
  defaults: HubNotificationPreferences,
) {
  const { data, error } = await admin.from(TABLE)
    .select("inbox,preferences").eq("user_id", user.id).maybeSingle();
  if (error) throw new Error(error.message);
  // During rollout, accounts without a migrated row can still read legacy state.
  const rawInbox = data ? data.inbox : user.app_metadata?.tcs_notification_inbox;
  const rawPreferences = data ? data.preferences : user.app_metadata?.tcs_notification_preferences;
  const preferences = rawPreferences && typeof rawPreferences === "object" && !Array.isArray(rawPreferences)
    ? { ...defaults, ...rawPreferences } as HubNotificationPreferences
    : { ...defaults };
  return { inbox: inboxEntries(rawInbox), preferences };
}

export async function saveStoredNotificationState(
  admin: SupabaseClient,
  userId: string,
  inbox: HubNotification[],
  preferences: HubNotificationPreferences,
) {
  const { error } = await admin.from(TABLE).upsert({
    user_id: userId,
    inbox: inbox.slice(0, MAX_NOTIFICATIONS),
    preferences,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
}

// Only the scan that inserts the alert may send a push. A concurrent scan
// reloads the inbox before retrying so it also preserves unrelated new alerts.
export async function claimFileAuditAlert(
  admin: SupabaseClient, user: User, notification: HubNotification,
  seedInbox: HubNotification[], preferences: HubNotificationPreferences,
) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const { data, error } = await admin.from(TABLE).select("inbox,preferences,updated_at")
      .eq("user_id", user.id).maybeSingle();
    if (error) throw new Error(error.message);
    const inbox = data ? inboxEntries(data.inbox) : seedInbox;
    if (data?.preferences?.enabled === false || inbox.some(item => item.eventKey === notification.eventKey)) return false;
    const values = { inbox: [notification, ...inbox].slice(0, MAX_NOTIFICATIONS), updated_at: new Date().toISOString() };
    if (!data) {
      const result = await admin.from(TABLE).insert({ user_id: user.id, preferences, ...values });
      if (!result.error) return true;
      if (result.error.code === "23505") continue;
      throw new Error(result.error.message);
    }
    const result = await admin.from(TABLE).update(values).eq("user_id", user.id)
      .eq("updated_at", data.updated_at)
      .not("inbox", "cs", JSON.stringify([{ eventKey: notification.eventKey }]))
      .select("user_id").maybeSingle();
    if (result.error) throw new Error(result.error.message);
    if (result.data) return true;
  }
  throw new Error("Child-file alert inbox was busy. Retry the scan.");
}
