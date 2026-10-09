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
