import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HubNotification } from "@/lib/notifications";
import { deliverStoredTransportAlert } from "@/lib/server/notifications";

type Delivery = { id: number; user_id: string; notification: HubNotification };

/** Each confirmed event has one durable delivery per authorized staff account. */
export async function flushTransportCustodyPushes(admin: SupabaseClient, organizationId: string) {
  for (let batch = 0; batch < 10; batch++) {
    const lease = randomUUID();
    const { data, error } = await admin.rpc("claim_transport_custody_pushes", { p_org: organizationId, p_lease: lease });
    if (error) throw new Error(error.message);
    const rows = (data || []) as Delivery[];
    if (!rows.length) return;
    // The database releases each recipient's next event after acknowledgement.
    const done: number[] = [];
    await Promise.all(rows.map(async row => {
      try {
        await deliverStoredTransportAlert(admin, row.user_id, row.notification, organizationId);
        done.push(row.id);
      } catch {
        // Leave the event pending if the provider or a staff lookup is unavailable.
      }
    }));
    if (done.length) {
      const ack = await admin.from("transport_custody_deliveries")
        .update({ delivered_at: new Date().toISOString() }).eq("organization_id", organizationId).eq("lease_id", lease).in("id", done);
      if (ack.error) throw new Error(ack.error.message);
    }
    if (!done.length) return;
  }
}
