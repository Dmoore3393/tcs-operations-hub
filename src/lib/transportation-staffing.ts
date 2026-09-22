import { supabase } from "@/lib/supabase/client";

export type TransportationDutyInput = {
  locationId: string;
  staffName: string;
  date: string;
  routeName: string;
  userId?: string | null;
};

function safePart(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

export function transportationDutyKey(date: string, routeName: string, staffName: string) {
  return `transport:${date}:${safePart(routeName)}:${safePart(staffName)}`;
}

function localTimeWithSeconds(date = new Date()) {
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map((value) => String(value).padStart(2, "0")).join(":");
}

export async function startTransportationDuty(input: TransportationDutyInput) {
  if (!supabase || !input.locationId || !input.staffName.trim()) return { ok: false, error: "Missing staffing connection information." };
  const sourceKey = transportationDutyKey(input.date, input.routeName, input.staffName);
  const existing = await supabase
    .from("staff_activity_intervals")
    .select("id,start_time,end_time")
    .eq("source_key", sourceKey)
    .maybeSingle();

  if (existing.error) return { ok: false, error: existing.error.message };
  if (existing.data?.id) return { ok: true, id: existing.data.id, sourceKey };

  const result = await supabase.from("staff_activity_intervals").insert({
    location_id: input.locationId,
    user_id: input.userId || null,
    staff_name: input.staffName.trim(),
    activity_date: input.date,
    start_time: localTimeWithSeconds(),
    end_time: "23:59:59",
    activity_type: "Transportation",
    counts_toward_floor: false,
    reason: `Transportation route • ${input.routeName}`,
    source_key: sourceKey,
  }).select("id").single();

  if (result.error) return { ok: false, error: result.error.message };
  return { ok: true, id: result.data.id, sourceKey };
}

export async function finishTransportationDuty(input: TransportationDutyInput) {
  if (!supabase || !input.staffName.trim()) return { ok: false, error: "Missing staffing connection information." };
  const sourceKey = transportationDutyKey(input.date, input.routeName, input.staffName);
  const existing = await supabase
    .from("staff_activity_intervals")
    .select("id,start_time,end_time")
    .eq("source_key", sourceKey)
    .maybeSingle();

  if (existing.error) return { ok: false, error: existing.error.message };
  if (!existing.data?.id) return { ok: true, sourceKey };

  const now = new Date();
  const [startHour, startMinute, startSecond] = String(existing.data.start_time || "00:00:00").split(":").map(Number);
  const startSeconds = startHour * 3600 + startMinute * 60 + (startSecond || 0);
  const nowSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const endSeconds = Math.max(nowSeconds, startSeconds + 1);
  const capped = Math.min(endSeconds, 23 * 3600 + 59 * 60 + 59);
  const hour = Math.floor(capped / 3600);
  const minute = Math.floor((capped % 3600) / 60);
  const second = capped % 60;
  const endTime = [hour, minute, second].map((value) => String(value).padStart(2, "0")).join(":");

  const result = await supabase
    .from("staff_activity_intervals")
    .update({ end_time: endTime })
    .eq("id", existing.data.id);

  if (result.error) return { ok: false, error: result.error.message };
  return { ok: true, id: existing.data.id, sourceKey };
}
