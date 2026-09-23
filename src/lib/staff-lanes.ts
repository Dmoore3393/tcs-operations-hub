export type StaffLaneProfile = {
  id: string;
  organization_id: string;
  staff_user_id: string | null;
  full_name: string;
  preferred_name: string | null;
  lane_level: number | null;
  lane_group: string;
  job_title: string;
  secondary_title: string | null;
  department: string | null;
  primary_location: string | null;
  reports_to_lane_id: string | null;
  reports_to_label: string | null;
  lane_summary: string | null;
  source_label: string;
  is_active: boolean;
  sort_order: number;
  access_role?: string | null;
  account_active?: boolean | null;
};

export function laneLevelLabel(lane: StaffLaneProfile) {
  return lane.lane_level ? `Level ${lane.lane_level}` : lane.lane_group;
}

export function laneDisplayName(lane: StaffLaneProfile) {
  return lane.preferred_name ? `${lane.full_name} (${lane.preferred_name})` : lane.full_name;
}

export function laneTitleLine(lane: StaffLaneProfile) {
  return lane.secondary_title ? `${lane.job_title} • ${lane.secondary_title}` : lane.job_title;
}
