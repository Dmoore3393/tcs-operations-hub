import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";
import { birthdayMonthNow, birthdaysInMonth, readStaffContact, type BirthdayEntry } from "@/lib/staff-contact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { admin, profile } = await requireStaff(request);
    const { data: staff, error } = await admin.from("staff_access")
      .select("user_id,full_name")
      .eq("organization_id", profile.organization_id)
      .eq("is_active", true)
      .not("accepted_at", "is", null);
    if (error) throw error;

    const entries: BirthdayEntry[] = [];
    const people = staff ?? [];
    // Only load active colleagues in this organization, in bounded batches.
    for (let index = 0; index < people.length; index += 10) {
      const batch = await Promise.all(people.slice(index, index + 10).map(async (person) => {
        const result = await admin.auth.admin.getUserById(person.user_id);
        if (result.error) throw result.error;
        const contact = readStaffContact(result.data.user?.user_metadata);
        return { id: person.user_id, name: person.full_name, month: Number(contact.birthday_month), day: Number(contact.birthday_day) };
      }));
      entries.push(...batch);
    }

    const month = birthdayMonthNow();
    // Never return email, phone, Auth metadata, or a birth year to the Lounge.
    return Response.json({ month, birthdays: birthdaysInMonth(entries, month) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
