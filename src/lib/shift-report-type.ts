import { openingChecklist, closingChecklist, type ShiftReportType } from "@/lib/employee-care";
export const defaultShiftWindow = (type: ShiftReportType) => type === "Opening" ? "6:00 AM–12:00 PM" : "12:00 PM–Close";
export function changeReportType<T extends {type:ShiftReportType;shiftWindow:string;checklist:Record<string,boolean>}>(report:T,type:ShiftReportType):T {
 if(report.type===type)return report;
 return {...report,type,shiftWindow:report.shiftWindow===defaultShiftWindow(report.type)?defaultShiftWindow(type):report.shiftWindow,
 checklist:Object.fromEntries((type==='Opening'?openingChecklist:closingChecklist).map(item=>[item,report.checklist[item]===true]))};
}
