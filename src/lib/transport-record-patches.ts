type RecordData = Record<string, unknown>;
export type TransportRecordPatch = { id: string; before: RecordData; after: RecordData };

/** Diff the reviewed snapshot. Never replace a collection or infer a child identity. */
export function transportRecordPatches(before: unknown[], after: unknown[]): TransportRecordPatch[] {
  const clean = (items: unknown[]) => (JSON.parse(JSON.stringify(items)) as RecordData[]);
  const prior = new Map(clean(before).map(row => [String(row.id), row]));
  const next = clean(after);
  if (new Set(next.map(row => String(row.id))).size !== next.length) throw new Error("A trip appears twice. Refresh transportation before saving.");
  if ([...prior.keys()].some(id => !next.some(row => String(row.id) === id))) throw new Error("Set a trip to Not Riding to stop it while keeping its history.");
  return next.flatMap(row => {
    const old = prior.get(String(row.id));
    if (!old) throw new Error("Add new school trips through Routes & call-outs.");
    return JSON.stringify(old) === JSON.stringify(row) ? [] : [{ id: String(row.id), before: old, after: row }];
  });
}
