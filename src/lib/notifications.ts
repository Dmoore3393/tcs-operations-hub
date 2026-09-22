export type HubNotificationCategory = "transportation" | "emergency" | "tour" | "schedule" | "system";
export type HubNotificationSeverity = "info" | "attention" | "urgent" | "success";

export type HubNotification = {
  id: string;
  category: HubNotificationCategory;
  severity: HubNotificationSeverity;
  title: string;
  body: string;
  href: string;
  location: string;
  createdAt: string;
  readAt: string;
  eventKey: string;
};

export type HubNotificationEventType =
  | "transportation_update"
  | "transportation_pickup"
  | "transportation_arrival"
  | "transportation_checkin"
  | "transportation_handoff_attention"
  | "emergency_record_attention"
  | "tour_board_update"
  | "tour_follow_up"
  | "schedule_update"
  | "schedule_published";

export type HubNotificationContext = {
  childName?: string;
  school?: string;
  destination?: string;
  driver?: string;
  vehicle?: string;
  statusTime?: string;
  reason?: string;
};

export type HubNotificationPreferences = {
  enabled: boolean;
  transportation: boolean;
  emergency: boolean;
  tour: boolean;
  schedule: boolean;
  sound: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
};

export const defaultNotificationPreferences: HubNotificationPreferences = {
  enabled: true,
  transportation: true,
  emergency: true,
  tour: true,
  schedule: true,
  sound: true,
  quietHoursEnabled: false,
  quietHoursStart: "21:00",
  quietHoursEnd: "06:00",
};

export function categoryForEvent(type: HubNotificationEventType): HubNotificationCategory {
  if (type.startsWith("transportation_")) return "transportation";
  if (type === "emergency_record_attention") return "emergency";
  if (type === "tour_board_update" || type === "tour_follow_up") return "tour";
  return "schedule";
}

export function notificationTemplate(type: HubNotificationEventType, context: HubNotificationContext = {}) {
  const child = context.childName?.trim() || "A child";
  const school = context.school?.trim() || "school";
  const destination = context.destination?.trim() || "the destination location";
  const driver = context.driver?.trim() || "route staff";
  switch (type) {
    case "transportation_pickup":
      return {
        category: "transportation" as const,
        severity: "success" as const,
        title: "Child picked up",
        body: `${child} was picked up from ${school} by ${driver} and is now in transit to ${destination}.`,
        href: "/transportation",
      };
    case "transportation_arrival":
      return {
        category: "transportation" as const,
        severity: "info" as const,
        title: "Child arrived",
        body: `${child} arrived at ${destination} and has been checked into the location.`,
        href: "/transportation",
      };
    case "transportation_checkin":
      return {
        category: "transportation" as const,
        severity: "success" as const,
        title: "Transportation check-in complete",
        body: `${child} was checked into ${destination} by ${driver}.`,
        href: "/transportation",
      };
    case "transportation_handoff_attention":
      return {
        category: "transportation" as const,
        severity: "urgent" as const,
        title: "Transportation check needed",
        body: context.reason?.trim() || `${child} is still marked in transit and needs leadership review.`,
        href: "/transportation",
      };
    case "transportation_update":
      return {
        category: "transportation" as const,
        severity: "attention" as const,
        title: "Transportation update",
        body: "A transportation route was changed. Open The Hub to review the current route.",
        href: "/transportation",
      };
    case "emergency_record_attention":
      return {
        category: "emergency" as const,
        severity: "urgent" as const,
        title: "Emergency record needs attention",
        body: "An emergency medical record needs review. Open The Hub for the secured details.",
        href: "/emergency-cards",
      };
    case "tour_follow_up":
      return {
        category: "tour" as const,
        severity: "attention" as const,
        title: "Tour Board follow-up",
        body: "A family lead needs follow-up. Open The Hub to review the record.",
        href: "/enrollment-pipeline",
      };
    case "tour_board_update":
      return {
        category: "tour" as const,
        severity: "info" as const,
        title: "Tour Board updated",
        body: "A family lead or tour was updated. Open The Hub to review the latest status.",
        href: "/enrollment-pipeline",
      };
    case "schedule_update":
      return {
        category: "schedule" as const,
        severity: "info" as const,
        title: "Staff schedule updated",
        body: "A staff schedule was added or changed. Open The Hub to review the current schedule.",
        href: "/scheduling",
      };
    case "schedule_published":
      return {
        category: "schedule" as const,
        severity: "attention" as const,
        title: "Location schedule published",
        body: "A staff schedule was published or revised for your location. Open My Schedule to see your assigned shifts and acknowledge the current revision if you are scheduled.",
        href: "/my-schedule",
      };
  }
}
