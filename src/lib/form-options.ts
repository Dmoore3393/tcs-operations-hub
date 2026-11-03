/** Suggestions for free-text fields; choosing one never changes permissions. */
export const weekdayChoices = ["Mon–Fri", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Mon, Wed, Fri", "Tue, Thu", "Sat, Sun", "Daily"];
export const gradeChoices = ["Preschool", "TK", "Kindergarten", ...Array.from({ length: 12 }, (_, index) => String(index + 1))];
export const relationshipChoices = ["Mother", "Father", "Parent", "Guardian", "Grandmother", "Grandfather", "Aunt", "Uncle", "Sibling", "Family friend"];
export const positionChoices = ["Teacher Assistant", "Lead Teacher", "Acting Lead Teacher (temporary)", "Floor Coverage", "Location Licensee", "Driver", "Maintenance", "Office / Administration"];
export const pickupAreaChoices = ["Front gate", "Main office", "Bus lane", "After-school program", "Classroom"];
