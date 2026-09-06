import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

const STATE_KEY = "tcs-employee-lounge-shoutouts-v1";
const MAX_SHOUT_OUTS = 200;
const MAX_MESSAGE_LENGTH = 500;

type StoredShoutOut = {
  id: string;
  from: string;
  message: string;
  created_at: string;
  created_by: string;
};

type HubStateRow = {
  state_value: unknown;
  version: number;
};

function normalizeShoutOuts(value: unknown): StoredShoutOut[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : randomUUID(),
      from: typeof item.from === "string" && item.from.trim() ? item.from.trim().slice(0, 120) : "TCS Team Member",
      message: typeof item.message === "string" ? item.message.trim().slice(0, MAX_MESSAGE_LENGTH) : "",
      created_at: typeof item.created_at === "string" ? item.created_at : new Date().toISOString(),
      created_by: typeof item.created_by === "string" ? item.created_by : "",
    }))
    .filter((item) => item.message)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, MAX_SHOUT_OUTS);
}

async function repairLatestAuditActor(
  admin: Awaited<ReturnType<typeof requireStaff>>["admin"],
  organizationId: string,
  action: "INSERT" | "UPDATE",
  userId: string,
) {
  const { data } = await admin
    .from("hub_audit")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("state_key", STATE_KEY)
    .eq("action", action)
    .is("changed_by", null)
    .order("changed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data?.id) {
    await admin.from("hub_audit").update({ changed_by: userId }).eq("id", data.id);
  }
}

async function loadRow(
  admin: Awaited<ReturnType<typeof requireStaff>>["admin"],
  organizationId: string,
) {
  const { data, error } = await admin
    .from("hub_state")
    .select("state_value,version")
    .eq("organization_id", organizationId)
    .eq("state_key", STATE_KEY)
    .maybeSingle();
  if (error) throw error;
  return (data as HubStateRow | null) ?? null;
}

export async function GET(request: Request) {
  try {
    const { admin, profile } = await requireStaff(request);
    const row = await loadRow(admin, profile.organization_id);
    return Response.json({ shoutOuts: normalizeShoutOuts(row?.state_value) });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { admin, user, profile } = await requireStaff(request);
    const body = (await request.json().catch(() => ({}))) as { message?: unknown };
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!message) {
      return Response.json({ error: "Write a shout-out before posting." }, { status: 400 });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return Response.json({ error: `Keep shout-outs under ${MAX_MESSAGE_LENGTH} characters.` }, { status: 400 });
    }

    const newShoutOut: StoredShoutOut = {
      id: randomUUID(),
      from: profile.full_name?.trim() || "TCS Team Member",
      message,
      created_at: new Date().toISOString(),
      created_by: user.id,
    };

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await loadRow(admin, profile.organization_id);
      const nextShoutOuts = [newShoutOut, ...normalizeShoutOuts(current?.state_value)].slice(0, MAX_SHOUT_OUTS);

      if (!current) {
        const { data, error } = await admin
          .from("hub_state")
          .insert({
            organization_id: profile.organization_id,
            state_key: STATE_KEY,
            state_value: nextShoutOuts,
            version: 1,
            updated_by: user.id,
          })
          .select("state_value,version")
          .maybeSingle();

        if (error?.code === "23505") continue;
        if (error) throw error;
        await repairLatestAuditActor(admin, profile.organization_id, "INSERT", user.id);
        return Response.json({ ok: true, shoutOuts: normalizeShoutOuts(data?.state_value) });
      }

      const { data, error } = await admin
        .from("hub_state")
        .update({
          state_value: nextShoutOuts,
          version: current.version + 1,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", profile.organization_id)
        .eq("state_key", STATE_KEY)
        .eq("version", current.version)
        .select("state_value,version")
        .maybeSingle();

      if (error) throw error;
      if (!data) continue;

      await repairLatestAuditActor(admin, profile.organization_id, "UPDATE", user.id);
      return Response.json({ ok: true, shoutOuts: normalizeShoutOuts(data.state_value) });
    }

    return Response.json({ error: "Someone else posted at the same time. Please try again." }, { status: 409 });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
