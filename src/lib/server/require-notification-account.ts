import "server-only";

import { requireStaff } from "@/lib/server/require-staff";
import { requireParent } from "@/lib/server/require-parent";

// Push registration belongs to the authenticated account. A parent must also
// have active, explicitly authorized child access; an arbitrary login is insufficient.
export async function requireNotificationAccount(request: Request) {
  try {
    const { admin, user } = await requireStaff(request);
    return { admin, user };
  } catch (error) {
    if (!(error instanceof Response) || ![401, 403].includes(error.status)) throw error;
    const { admin, user } = await requireParent(request);
    return { admin, user };
  }
}
