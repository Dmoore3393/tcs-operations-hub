import type { WorkTask } from "@/lib/hub-data";
import type { HandoffItem, ShiftReport } from "@/lib/employee-care";
import { normalizeLocation } from "@/lib/location-config";

export function taskBelongsTo(task: WorkTask, staffName: string) {
  const owner = task.owner.trim().toLowerCase(), staff = staffName.trim().toLowerCase();
  return Boolean(owner && staff && (owner === staff || (!owner.includes(" ") && owner === staff.split(/\s+/)[0])));
}
export function taskDueTime(task: WorkTask) {
  const stamp = Date.parse(task.dueAt || "");
  return Number.isNaN(stamp) ? null : stamp;
}
export function taskIsOverdue(task: WorkTask, now = Date.now()) {
  const due = taskDueTime(task);
  return !task.completed && due !== null && due < now;
}
export function taskDueLabel(task: WorkTask) {
  const due = taskDueTime(task);
  return due === null ? task.due || "No deadline set" : new Date(due).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
export type FollowThroughItem = { id: string; title: string; detail: string; href: string; priority: number; kind: "task" | "handoff" | "review"; overdue?: boolean };
export function buildFollowThrough(input: {
  tasks: WorkTask[]; handoffs: HandoffItem[]; reports: ShiftReport[]; location: string;
  staffName: string; mine: boolean; canReview: boolean; now: number;
}) {
  const atLocation = (value: string) => input.location === "All Locations" || value === "All Sites" || normalizeLocation(value) === input.location;
  const items: FollowThroughItem[] = input.tasks.filter((task) => !task.completed && atLocation(task.location) && (!input.mine || taskBelongsTo(task, input.staffName))).map((task) => {
    const overdue = taskIsOverdue(task, input.now);
    return { id: `task-${task.id}`, title: task.title, detail: `${task.owner} · Due ${taskDueLabel(task)}${task.checkpoint ? ` · ${task.checkpoint}` : ""}`, href: "/work-plans", priority: overdue ? 0 : task.priority === "Urgent" ? 1 : task.priority === "High" ? 3 : 5, kind: "task", overdue };
  });
  input.handoffs.filter((item) => !item.completed && atLocation(item.location)).forEach((item) => items.push({ id: `handoff-${item.id}`, title: item.details, detail: `${item.location} · ${item.date} · ${item.category}`, href: "/shift-reports#pickup-handoff", priority: item.priority === "Urgent" ? 0 : 2, kind: "handoff" }));
  if (input.canReview) input.reports.filter((report) => report.status === "Submitted" && atLocation(report.location)).forEach((report) => items.push({ id: `review-${report.id}`, title: `${report.type} report needs review`, detail: `${report.location} · ${report.date} · ${report.completedBy}`, href: "/shift-reports#report-history", priority: 4, kind: "review" }));
  return items.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
}
