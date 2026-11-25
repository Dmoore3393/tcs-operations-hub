export type ClockPunchEvent = "clock_in" | "clock_out" | "break_start" | "break_end";
export type ClockPunchReceipt = {
  ok: true;
  id: string;
  event: ClockPunchEvent;
  occurredAt: string;
  location: string;
  source: string;
  targetStaffUserId: string;
  targetStaffName: string;
  performedByUserId: string;
  needsLeadershipReview?: boolean;
  scheduleReview?: string[];
  reviewWarning?: string;
};

/** Never infer a saved punch from a QR scan, HTTP 200, or optimistic UI state. */
export async function saveClockPunch(
  token: string,
  input: {event: ClockPunchEvent; source: string; location: string; pin: string; targetUserId?: string},
  expectedStaffUserId: string,
  fetcher: typeof fetch = fetch,
): Promise<ClockPunchReceipt> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetcher("/api/time-clock", {
      method: "POST",
      headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json"},
      body: JSON.stringify({...input, clientTimestamp: new Date().toISOString()}),
      signal: controller.signal,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(typeof result?.error === "string" ? result.error : "Time clock update failed.");
    if (result?.ok !== true || typeof result.id !== "string" || !result.id
      || result.event !== input.event || result.targetStaffUserId !== expectedStaffUserId
      || result.source !== input.source || typeof result.location !== "string" || !result.location
      || typeof result.occurredAt !== "string" || !Number.isFinite(Date.parse(result.occurredAt))) {
      throw new Error("The server did not confirm a saved clock action. Check your saved status before trying again.");
    }
    return result as ClockPunchReceipt;
  } catch (error) {
    if (controller.signal.aborted || error instanceof TypeError || error instanceof SyntaxError) {
      throw new Error("Your clock action is not confirmed. Check your saved status before trying again; do not assume you are clocked out.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
