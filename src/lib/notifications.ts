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
  | "emergency_record_attention"
  | "tour_board_update"
  | "tour_follow_up"
  | "schedule_update";

export type HubNotificationPreferences = {
  enabled: boolean;
  transportation: boolean;
  emergency: boolean;
  tour: boolean;
  schedule: boolean;
  sound: boolean;
};

export const defaultNotificationPreferences: HubNotificationPreferences = {
  enabled: true,
  transportation: true,
  emergency: true,
  tour: true,
  schedule: true,
  sound: true,
};

export function categoryForEvent(type: HubNotificationEventType): HubNotificationCategory {
  if (type === "transportation_update") return "transportation";
  if (type === "emergency_record_attention") return "emergency";
  if (type === "tour_board_update" || type === "tour_follow_up") return "tour";
  return "schedule";
}

export function notificationTemplate(type: HubNotificationEventType) {
  switch (type) {
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
  }
}
