export type MaintenancePriority = "Routine" | "Soon" | "Urgent" | "Safety Critical";
export type MaintenanceStatus = "Open" | "Assigned" | "In Progress" | "Waiting on Parts" | "Completed";

export type MaintenanceTicket = {
  id: string;
  location: string;
  area: string;
  title: string;
  description: string;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  reportedBy: string;
  assignedTo: string;
  reportedAt: string;
  dueDate: string;
  completedAt: string;
  completionNotes: string;
};

export const starterMaintenanceTickets: MaintenanceTicket[] = [];

export function maintenancePriorityRank(priority: MaintenancePriority) {
  return { "Safety Critical": 0, Urgent: 1, Soon: 2, Routine: 3 }[priority];
}
