/** Interpret entered wall time in the program's timezone, independent of device timezone. */
export function pacificWorkedTime(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('Enter a valid date and time.');
  const matches = ['-07:00', '-08:00'].map(offset => new Date(`${value}:00${offset}`)).filter(date => {
    if (!Number.isFinite(date.getTime())) return false;
    const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
    const part = (key:string) => parts.find(p=>p.type===key)?.value;
    return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}` === value;
  });
  if (matches.length !== 1) throw new Error(matches.length ? 'This time occurs twice during the daylight saving change. Enter the shift in separate portions outside that repeated hour.' : 'That date or time does not exist. Check the date and daylight saving time.');
  return matches[0].toISOString();
}
