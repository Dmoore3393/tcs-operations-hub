import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";

export const runtime = "nodejs";

const ALLOWED_KEYS = new Set(["tcs-schools-v2", "tcs-vehicles-v2"]);

function isTransportationLeader(fullName: string, email: string) {
  const identity = `${fullName} ${email}`.toLowerCase();
  return identity.includes("danielle moore") || identity.includes("jennifer thomason") || identity.includes("heather graham");
}

export async function POST(request: Request) {
  try {
    const { admin, user, profile, isOwner, isLicensee } = await requireStaff(request);
    const allowed = isOwner || isLicensee || isTransportationLeader(profile.full_name, profile.email);
    if (!allowed) throw new Response("Transportation setup changes are restricted to authorized transportation leadership.", { status: 403 });

    const body = await request.json() as { stateKey?: string; value?: unknown };
    const stateKey = String(body.stateKey ?? "").trim();
    if (!ALLOWED_KEYS.has(stateKey) || !Array.isArray(body.value)) {
      return Response.json({ error: "Choose a valid transportation setup collection." }, { status: 400 });
    }

    const { data: existing, error: readError } = await admin
      .from("hub_state")
      .select("version")
      .eq("organization_id", profile.organization_id)
      .eq("state_key", stateKey)
      .maybeSingle();
    if (readError) throw readError;

    const { error: saveError } = await admin
      .from("hub_state")
      .upsert({
        organization_id: profile.organization_id,
        state_key: stateKey,
        state_value: body.value,
        version: Number(existing?.version ?? 0) + 1,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: "organization_id,state_key" });
    if (saveError) throw saveError;

    return Response.json({ ok: true });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
