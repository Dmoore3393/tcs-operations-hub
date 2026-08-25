"use client";

import { supabase } from "@/lib/supabase/client";
import { normalizeLocation } from "@/lib/location-config";

const slugs: Record<string, string> = {
  Halcom: "halcom",
  "21st Street": "21st-street",
  Division: "division",
  "33rd Street": "33rd-street",
  Tehachapi: "tehachapi",
  "42nd Street": "42nd-street",
};

const auditableTables = new Set([
  "children",
  "child_schedules",
  "daily_care_entries",
  "weekly_menus",
  "meal_services",
  "shift_reports",
  "handoff_items",
  "incidents",
  "kidkare_enrollments",
  "timesheets",
  "timesheet_submission_routes",
  "transportation_routes",
  "document_records",
]);

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function resolveAuditLocationId(location?: string | null) {
  if (!supabase || !location || location === "All Locations" || location === "All Sites") return null;
  const normalized = normalizeLocation(location);
  const slug = slugs[normalized];
  if (!slug) return null;
  const { data } = await supabase.from("locations").select("id").eq("slug", slug).maybeSingle();
  return data?.id ?? null;
}

export async function recordAuditEvent(options: {
  action: "REVIEW" | "EXPORT";
  tableName: string;
  location?: string | null;
  rowId?: string | null;
  legacyId?: string | number | null;
  metadata?: Record<string, unknown>;
}) {
  if (!supabase) return;

  const locationId = await resolveAuditLocationId(options.location);
  let rowId: string | null = options.rowId && isUuid(options.rowId) ? options.rowId : null;

  if (!rowId && options.legacyId != null && auditableTables.has(options.tableName)) {
    const { data } = await supabase
      .from(options.tableName)
      .select("id")
      .eq("legacy_id", String(options.legacyId))
      .maybeSingle();
    rowId = data?.id ?? null;
  }

  const { error } = await supabase.rpc("record_audit_event", {
    p_action: options.action,
    p_table_name: options.tableName,
    p_row_id: rowId,
    p_location_id: locationId,
    p_metadata: options.metadata ?? {},
  });

  if (error) throw error;
}
