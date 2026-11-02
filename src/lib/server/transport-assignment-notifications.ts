import "server-only";
import type {AuthorizedStaff} from "@/lib/server/require-staff";
import type {HubNotification} from "@/lib/notifications";
import {deliverStoredTransportAlert} from "@/lib/server/notifications";
/** Database-owned recipients and event keys. Never accept either from the browser. */
export async function flushTransportAssignmentNotices(c:AuthorizedStaff){
 const {data,error}=await c.admin.rpc('deliver_transport_assignment_notices',{p_org:c.profile.organization_id,p_recipient:c.isOwner||c.isLicensee?null:c.user.id,p_actor:c.isLicensee?c.user.id:null});
 if(error)throw new Error(error.message);
 const rows=(data||[]) as {user_id:string;notification:HubNotification}[];
 await Promise.allSettled(rows.map(row=>deliverStoredTransportAlert(c.admin,row.user_id,row.notification)));
 return rows.length;
}
