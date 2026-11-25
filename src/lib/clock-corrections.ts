type Row = Record<string, unknown>;
/** Overlay corrections without rewriting the immutable original clock receipts. */
export function correctedClockRows(rows: Row[]): Row[] {
  const corrections = new Map<string, Row>();
  for (const row of [...rows].sort((a,b) => String(a.occurred_at).localeCompare(String(b.occurred_at)))) {
    const meta = row.metadata as Row | null;
    if (meta?.kind === "staff_time_clock_correction") corrections.set(String(meta.eventId), meta);
  }
  return rows.filter(row => (row.metadata as Row | null)?.kind !== "staff_time_clock_correction").map(row => {
    const correction = corrections.get(String(row.id));
    return correction ? {...row, occurred_at: correction.correctedAt, metadata: {...(row.metadata as Row), correction}} : row;
  }).sort((a,b) => String(a.occurred_at).localeCompare(String(b.occurred_at)) || (Number((a.metadata as Row)?.event === "clock_in") - Number((b.metadata as Row)?.event === "clock_in")));
}

export function pacificCorrectionTime(original: string, time: string): string {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Enter a valid time.');
  const day = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(original));
  const offset = new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',timeZoneName:'shortOffset'}).formatToParts(new Date(original)).find(p=>p.type==='timeZoneName')?.value==='GMT-7'?'-07:00':'-08:00';
  for (const candidateOffset of [offset,offset==='-07:00'?'-08:00':'-07:00']) {
    const candidate = new Date(`${day}T${time}:00${candidateOffset}`);
    const actual = new Intl.DateTimeFormat('en-GB',{timeZone:'America/Los_Angeles',hour:'2-digit',minute:'2-digit',hour12:false}).format(candidate);
    if (actual===time) return candidate.toISOString();
  }
  throw new Error('That time does not exist on this date because of daylight saving time.');
}
