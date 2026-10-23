"use client";

import { useState, type FormEvent } from "react";
import { Check, LoaderCircle } from "lucide-react";
import StaffContactFields from "@/components/StaffContactFields";
import { useAuth } from "@/components/providers/AuthProvider";
import { validateStaffContact, type StaffContactDetails } from "@/lib/staff-contact";

export default function StaffContactEditor({ userId, email, contact, onChange, onSaved }: {
  userId: string;
  email: string;
  contact: StaffContactDetails;
  onChange: (contact: StaffContactDetails) => void;
  onSaved: () => Promise<void>;
}) {
  const { session } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !session) return;
    const validated = validateStaffContact(contact, false);
    if (validated.error) { setError(validated.error); return; }
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/team-access/contact", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ user_id: userId, contact: validated.contact }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not save contact details.");
      await onSaved();
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save contact details. Please retry.");
    } finally {
      setSaving(false);
    }
  }

  return <form onSubmit={save} className="space-y-4">
    <StaffContactFields value={contact} onChange={(next) => { onChange(next); setSaved(false); }} email={email} required={false} disabled={saving} />
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p>}
    {saved && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-900">Contact details and birthday saved.</p>}
    <button type="submit" disabled={saving || !session} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white disabled:opacity-60">
      {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{saving ? "Saving…" : "Save Contact Details"}
    </button>
  </form>;
}
