import Link from "next/link";
import type { ChildRecord } from "@/lib/children";
import { familyChildIdentity } from "@/lib/family-edit";

export default function FamilyChildContacts({ members, canEdit = false }: { members: ChildRecord[]; canEdit?: boolean }) {
  return <section className="mt-4 space-y-3" aria-label="Parents by child">
    <h3 className="font-black text-slate-900">Parents and contacts by child</h3>
    <p className="text-sm text-slate-700">Children in one family may have different parents. Correct one child without changing a sibling.</p>
    {members.map(child => <article key={familyChildIdentity(child)} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-base">
      <h4 className="font-black" translate="no">{child.firstName} {child.lastName}</h4>
      <p>Primary guardian: <span translate="no">{child.primaryGuardian || "Not entered"}</span></p>
      <p>Secondary guardian: <span translate="no">{child.secondaryGuardian || "Not entered"}</span></p>
      <p className="break-words" translate="no">{[child.phone, child.guardianEmail].filter(Boolean).join(" · ")}</p>
      {canEdit && <Link className="mt-2 inline-flex min-h-11 items-center font-bold text-emerald-900 underline" href={`/children?editChild=${encodeURIComponent(familyChildIdentity(child))}`}>Edit this child’s parents</Link>}
    </article>)}
  </section>;
}
