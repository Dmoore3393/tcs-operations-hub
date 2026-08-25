export type RelationalStateConfig = {
  table: string;
  label: string;
};

export const relationalStateConfigs: Record<string, RelationalStateConfig> = {
  "tcs-children-v1": { table: "children", label: "children" },
  "tcs-child-schedules-v2": { table: "child_schedules", label: "child schedules" },
  "tcs-daily-care-v1": { table: "daily_care_entries", label: "daily care entries" },
  "tcs-weekly-menus-v1": { table: "weekly_menus", label: "weekly menus" },
  "tcs-meal-services-v1": { table: "meal_services", label: "meal services" },
  "tcs-shift-reports-v1": { table: "shift_reports", label: "opening and closing reports" },
  "tcs-shift-handoffs-v1": { table: "handoff_items", label: "shift handoffs" },
  "tcs-health-safety-v1": { table: "incidents", label: "health and safety records" },
  "tcs-kidkare-enrollments-v1": { table: "kidkare_enrollments", label: "KidKare records" },
  "tcs-timesheets-v1": { table: "timesheets", label: "timesheets" },
  "tcs-timesheet-department-routes-v1": { table: "timesheet_submission_routes", label: "timesheet routing" },
  "tcs-routes": { table: "transportation_routes", label: "transportation routes" },
  "tcs-files": { table: "compliance_files", label: "compliance files" },
  "tcs-transportation-fees-v1": { table: "transportation_fee_records", label: "transportation fee records" },
  "tcs-enrollment-pipeline-v1": { table: "enrollment_leads", label: "enrollment leads" },
  "tcs-digital-forms-v1": { table: "digital_forms", label: "digital forms" },
};

export function relationalConfigForKey(key: string) {
  return relationalStateConfigs[key] ?? null;
}

export function sortRelationalRecords<T>(records: T[]): T[] {
  return [...records].sort((left, right) => {
    const a = left as Record<string, unknown>;
    const b = right as Record<string, unknown>;
    const aId = a.id;
    const bId = b.id;
    if (typeof aId === "number" && typeof bId === "number") return aId - bId;
    if (typeof aId === "string" && typeof bId === "string") return aId.localeCompare(bId);
    const aName = String(a.childName ?? a.firstName ?? a.location ?? "");
    const bName = String(b.childName ?? b.firstName ?? b.location ?? "");
    return aName.localeCompare(bName);
  });
}
