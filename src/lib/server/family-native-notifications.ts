import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { safeFamilyAccess } from "@/lib/family-access";
import { defaultNotificationPreferences, type HubNotification } from "@/lib/notifications";
import { loadStoredNotificationState, saveStoredNotificationState } from "@/lib/server/notification-state-store";
import { nativePushServerReady, parseNativePushRegistrations, sendApplePush } from "@/lib/server/native-push";

export type FamilyNativeEvent = "pickup" | "incident" | "schedule";

// Only native, authenticated app users explicitly linked to this child qualify.
// No email lookup, broad family broadcast, or child details in the APNs payload.
export async function notifyAuthorizedFamily(args: {
  admin: SupabaseClient;
  organizationId: string;
  childRowId: string;
  event: FamilyNativeEvent;
  eventKey: string;
}) {
  const { admin, organizationId, childRowId, event, eventKey } = args;
  if (!nativePushServerReady()) return { delivered: 0, reason: "iPhone notification delivery is not configured yet." };
  const result = await admin.from("children").select("id,organization_id,record_data")
    .eq("organization_id", organizationId).eq("id", childRowId).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) return { delivered: 0, reason: "No authorized child record was found." };
  const record = result.data.record_data as Record<string, unknown>;
  if (record.isAppReviewDemo === true) return { delivered: 0, reason: "Synthetic examples do not send family alerts." };

  const permission = event === "pickup" ? "viewAttendance" : event === "incident" ? "viewIncidents" : "viewSchedule";
  const category = event === "pickup" ? "transportation" : event === "incident" ? "emergency" : "schedule";
  const title = event === "pickup" ? "TCS pickup update" : event === "incident" ? "TCS incident update" : "TCS schedule update";
  const body = event === "incident" ? "Contact your childcare location for an incident update. Open The Hub for contact information." : "An update is available in your Parent Portal. Open The Hub to view it.";
  const adults = safeFamilyAccess(record.familyAccess).filter((adult) => adult.status === "Active" && adult.authUserId && adult.permissions[permission]);
  const handled = new Set<string>();
  let delivered = 0;
  for (const adult of adults) {
    const userId = adult.authUserId!;
    if (handled.has(userId)) continue;
    handled.add(userId);
    const { data } = await admin.auth.admin.getUserById(userId);
    const user = data.user;
    if (!user || user.email?.trim().toLowerCase() !== adult.email) continue;
    const bannedUntil = (user as typeof user & { banned_until?: string }).banned_until;
    if (bannedUntil && new Date(bannedUntil).getTime() > Date.now()) continue;
    const devices = parseNativePushRegistrations(user);
    if (!devices.length) continue;
    const state = await loadStoredNotificationState(admin, user, defaultNotificationPreferences);
    if (!state.preferences.enabled || !state.preferences[category] || state.inbox.some((item) => item.eventKey === eventKey)) continue;
    if (state.preferences.quietHoursEnabled) {
      const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
      const start = state.preferences.quietHoursStart, end = state.preferences.quietHoursEnd;
      if (start < end ? clock >= start && clock < end : start !== end && (clock >= start || clock < end)) continue;
    }
    let userDelivered = false;
    for (const device of devices) {
      if (device.bundleId !== "com.thomasonchildcaresolutions.thehub") continue;
      const response = await sendApplePush(device, { title, body, href: event === "incident" ? "/support" : "/parent/care", tag: eventKey });
      if (response.ok) userDelivered = true;
    }
    if (userDelivered) {
      const notification: HubNotification = { id: crypto.randomUUID(), category, severity: "info", title, body, href: event === "incident" ? "/support" : "/parent/care", location: "", createdAt: new Date().toISOString(), readAt: "", eventKey };
      await saveStoredNotificationState(admin, user.id, [notification, ...state.inbox].slice(0, 100), state.preferences);
      delivered += 1;
    }
  }
  return { delivered, reason: delivered ? "iPhone alert delivered." : "No eligible iPhone device received an alert. Contact the family directly when needed." };
}
