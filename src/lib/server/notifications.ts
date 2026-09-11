import "server-only";

import {
  categoryForEvent,
  defaultNotificationPreferences,
  notificationTemplate,
  type HubNotification,
  type HubNotificationEventType,
  type HubNotificationPreferences,
} from "@/lib/notifications";
import { isLicenseeAccessRole, isOwnerAccessRole } from "@/lib/team-access";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { sendWebPush, type StoredPushSubscription } from "@/lib/server/web-push";

const INBOX_KEY = "tcs_notification_inbox";
const PREFS_KEY = "tcs_notification_preferences";
const MAX_NOTIFICATIONS = 100;
const PUSH_KEY = "tcs_push_subscriptions";
const MAX_PUSH_SUBSCRIPTIONS = 8;

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function parseInbox(user: User): HubNotification[] {
  const raw = user.app_metadata?.[INBOX_KEY];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is HubNotification => Boolean(item) && typeof item === "object" && typeof (item as HubNotification).id === "string")
    .slice(0, MAX_NOTIFICATIONS);
}

function parsePreferences(user: User): HubNotificationPreferences {
  const raw = user.app_metadata?.[PREFS_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaultNotificationPreferences;
  return {
    ...defaultNotificationPreferences,
    ...(raw as Partial<HubNotificationPreferences>),
  };
}

export function parsePushSubscriptions(user: User): StoredPushSubscription[] {
  const raw = user.app_metadata?.[PUSH_KEY];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is StoredPushSubscription => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as StoredPushSubscription;
      return Boolean(
        candidate.endpoint &&
        candidate.keys?.p256dh &&
        candidate.keys?.auth &&
        candidate.endpoint.startsWith("https://")
      );
    })
    .slice(0, MAX_PUSH_SUBSCRIPTIONS);
}

export async function savePushSubscriptions(
  admin: SupabaseClient,
  user: User,
  subscriptions: StoredPushSubscription[],
) {
  const appMetadata = { ...(user.app_metadata ?? {}) };
  appMetadata[PUSH_KEY] = subscriptions.slice(0, MAX_PUSH_SUBSCRIPTIONS);
  const { error } = await admin.auth.admin.updateUserById(user.id, { app_metadata: appMetadata });
  if (error) throw new Error(error.message);
}

function acceptsCategory(preferences: HubNotificationPreferences, eventType: HubNotificationEventType) {
  if (!preferences.enabled) return false;
  const category = categoryForEvent(eventType);
  if (category === "transportation") return preferences.transportation;
  if (category === "emergency") return preferences.emergency;
  if (category === "tour") return preferences.tour;
  if (category === "schedule") return preferences.schedule;
  return true;
}

function minutesFromClock(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value || "");
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function pacificMinutesNow() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function quietHoursActive(preferences: HubNotificationPreferences) {
  if (!preferences.quietHoursEnabled) return false;
  const start = minutesFromClock(preferences.quietHoursStart);
  const end = minutesFromClock(preferences.quietHoursEnd);
  if (start === null || end === null || start === end) return false;
  const now = pacificMinutesNow();
  return start < end ? now >= start && now < end : now >= start || now < end;
}

function locationMatches(staffLocations: string[], requestedLocation: string) {
  if (!requestedLocation || requestedLocation === "All Locations") return true;
  if (staffLocations.includes("All Locations")) return true;
  const normalized = requestedLocation.trim().toLowerCase();
  return staffLocations.some((item) => item.trim().toLowerCase() === normalized);
}

function permissionMatches(role: string, permissions: string[], eventType: HubNotificationEventType) {
  if (isOwnerAccessRole(role) || isLicenseeAccessRole(role)) return true;
  if (eventType === "transportation_update") return permissions.includes("transportation");
  if (eventType === "emergency_record_attention") {
    return ["children_basic", "transportation", "health_safety"].some((permission) => permissions.includes(permission));
  }
  if (eventType === "schedule_update") return permissions.includes("schedules");
  return false;
}

export async function loadNotificationState(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) throw new Error(error?.message || "Could not load notification settings.");
  return {
    user: data.user,
    inbox: parseInbox(data.user),
    preferences: parsePreferences(data.user),
  };
}

export async function saveNotificationState(
  admin: SupabaseClient,
  user: User,
  inbox: HubNotification[],
  preferences: HubNotificationPreferences,
) {
  const appMetadata = { ...(user.app_metadata ?? {}) };
  appMetadata[INBOX_KEY] = inbox.slice(0, MAX_NOTIFICATIONS);
  appMetadata[PREFS_KEY] = preferences;
  const { error } = await admin.auth.admin.updateUserById(user.id, { app_metadata: appMetadata });
  if (error) throw new Error(error.message);
}

export async function dispatchHubNotification(args: {
  admin: SupabaseClient;
  senderUserId: string;
  organizationId: string;
  eventType: HubNotificationEventType;
  location?: string;
  eventKey?: string;
}) {
  const { admin, senderUserId, organizationId, eventType } = args;
  const location = args.location?.trim() || "All Locations";
  const template = notificationTemplate(eventType);
  const eventKey = (args.eventKey?.trim() || `${eventType}:${location}:${Date.now()}`).slice(0, 220);

  const { data: rows, error } = await admin
    .from("staff_access")
    .select("user_id,role,locations,permissions,is_active,organization_id")
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  if (error) throw new Error(error.message);

  const recipients = (rows ?? []).filter((row) => {
    const role = typeof row.role === "string" ? row.role : "";
    const locations = stringArray(row.locations);
    const permissions = stringArray(row.permissions);
    return locationMatches(locations, location) && permissionMatches(role, permissions, eventType);
  });

  let delivered = 0;
  for (const recipient of recipients) {
    const userId = String(recipient.user_id || "");
    if (!userId) continue;

    const { data: userData } = await admin.auth.admin.getUserById(userId);
    const user = userData.user;
    if (!user) continue;

    const preferences = parsePreferences(user);
    if (!acceptsCategory(preferences, eventType)) continue;

    const inbox = parseInbox(user);
    if (inbox.some((item) => item.eventKey === eventKey)) continue;

    const now = new Date().toISOString();
    const notification: HubNotification = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      category: template.category,
      severity: template.severity,
      title: template.title,
      body: template.body,
      href: template.href,
      location,
      createdAt: now,
      readAt: "",
      eventKey,
    };

    const nextInbox = [notification, ...inbox].slice(0, MAX_NOTIFICATIONS);
    await saveNotificationState(admin, user, nextInbox, preferences);

    const subscriptions = parsePushSubscriptions(user);
    const bypassQuietHours = notification.severity === "urgent";
    const shouldPush = !quietHoursActive(preferences) || bypassQuietHours;
    if (subscriptions.length && shouldPush) {
      const activeSubscriptions: StoredPushSubscription[] = [];
      for (const subscription of subscriptions) {
        try {
          const result = await sendWebPush(subscription, {
            title: notification.title,
            body: notification.body,
            href: notification.href,
            tag: notification.eventKey || notification.id,
          });
          if (!result.stale) activeSubscriptions.push(subscription);
        } catch {
          activeSubscriptions.push(subscription);
        }
      }
      if (activeSubscriptions.length !== subscriptions.length) {
        const refreshed = await admin.auth.admin.getUserById(user.id);
        if (refreshed.data.user) {
          await savePushSubscriptions(admin, refreshed.data.user, activeSubscriptions);
        }
      }
    }

    delivered += 1;
  }

  return { delivered, senderUserId };
}
