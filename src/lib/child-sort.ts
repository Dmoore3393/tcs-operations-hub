/** One alphabetical roster order for the website and packaged iPhone screens.
 * Use stored surname fields, not the final word of a display name: compound
 * surnames and suffixes must remain intact. Never mutate records while sorting.
 */
export type ChildSortName = {
  firstName?: string | null;
  lastName?: string | null;
  id?: string | number;
  legacyId?: string | null;
};

const nameOrder = new Intl.Collator("en-US", {
  usage: "sort", sensitivity: "base", numeric: true, ignorePunctuation: true,
});
const cleanName = (name: string | null | undefined) => (name ?? "").trim().normalize("NFC");

export function compareChildrenByLastName(a: ChildSortName, b: ChildSortName): number {
  const aLast = cleanName(a.lastName);
  const bLast = cleanName(b.lastName);
  // Incomplete names are visible at the end rather than silently disappearing.
  if (Boolean(aLast) !== Boolean(bLast)) return aLast ? -1 : 1;
  const byName = nameOrder.compare(aLast, bLast)
    || nameOrder.compare(cleanName(a.firstName), cleanName(b.firstName));
  if (byName) return byName;
  // Equal names keep a deterministic identity order without merging siblings.
  const aKey = String(a.legacyId || a.id || "");
  const bKey = String(b.legacyId || b.id || "");
  return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
}

export function sortChildrenByLastName<T extends ChildSortName>(children: readonly T[]): T[] {
  return [...children].sort(compareChildrenByLastName);
}
