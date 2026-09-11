import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startedAt = Date.now();
  try {
    const { admin, userClient, isOwner } = await requireStaff(request);
    if (!isOwner) throw new Response("System health is restricted to Owner/Admin accounts.", { status: 403 });

    const databaseCheck = await userClient.from("locations").select("id", { count: "exact", head: true });
    const auditCheck = await userClient.from("audit_log").select("id", { count: "exact", head: true });
    const bucketCheck = await admin.storage.getBucket("tcs-sensitive-documents");

    const databaseOk = !databaseCheck.error;
    const auditOk = !auditCheck.error;
    const storageOk = !bucketCheck.error && Boolean(bucketCheck.data);

    return Response.json({
      ok: databaseOk && auditOk && storageOk,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      deployment: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || "local",
      services: {
        database: { ok: databaseOk, message: databaseOk ? "Relational database reachable" : "Database check failed" },
        audit: { ok: auditOk, message: auditOk ? "Immutable audit log reachable" : "Audit log check failed" },
        documentStorage: { ok: storageOk, message: storageOk ? "Private document bucket reachable" : "Private document storage check failed" },
      },
    }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
    });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
