"use client";

import { CHECKLIST_STEPS, timesheetChecklist, type ChecklistRecord } from "@/lib/timesheet-checklist";
import { timesheetDeadlineFlag } from "@/lib/timesheet-policy";
import { pacificToday, timesheetRouteKey } from "@/lib/timesheet-workflow";
import type { SubmissionRoute } from "./SubmissionBatchControls";

export type ChecklistItem = ChecklistRecord & {
  canProcess?:boolean;canReviewSubmission?:boolean;workflowOwner?:string;workflowReviewer?:string;
  id:string;childName:string;servicePeriod:string;location:string;locationSlug:string;
  timesheetType:string;stage:string;submissionIssue:unknown;submissionDueDate?:string;jenReviewedAt?:string;
};
export default function ChildTimesheetChecklist({rows,canDirectIntake,canReview,saving,routes,onAction,onOpen,onBatch}:{
  rows:ChecklistItem[];canDirectIntake:boolean;canReview?:boolean;saving:boolean;routes:Record<string,SubmissionRoute>;
  onAction:(body:Record<string,unknown>,message:string)=>Promise<unknown>;
  onOpen:(id:string)=>void;onBatch:(id:string)=>void;
}) {
  return <section className="tscc-panel tscc-records tscc-child-checklist">
    <div className="tscc-panel-head"><div><h2>Child-by-child timesheet checklist</h2><p>Received → signed → dated → filled out → scanned → submitted. Record only the steps you have checked. Scan and send using your usual scanner and email; no upload is required here.</p>{canDirectIntake && <p>Jennifer processes Tehachapi forms. Danielle processes the other locations, with Jen reviewing afterward. Each assigned processor records receipt, signatures and dates here.</p>}</div><span className="tscc-chip green">{rows.length} forms</span></div>
    <div className="tscc-panel-body tscc-table-wrap"><table className="tscc-table"><thead><tr><th>Child / agency batch</th>{CHECKLIST_STEPS.map(step=><th key={step}>{step}</th>)}<th>Final review</th><th>Next action</th></tr></thead><tbody>{rows.map(record=>{
      const checks = timesheetChecklist(record);
      const canProcess = record.canProcess ?? canDirectIntake;
      const owner=record.workflowOwner || "Danielle";
      const tehachapi=record.locationSlug === "tehachapi";
      const locked = saving || !canProcess || Boolean(record.completedAt || record.scanDocumentId || record.submissionIssue);
      const dueFlag=record.submissionIssue ? "Correction required" : timesheetDeadlineFlag(record.submissionDueDate || "",checks[5],pacificToday());
      const route = routes[timesheetRouteKey(record.locationSlug,record.timesheetType)];
      const mark = (index:number) => onAction({action:"directIntake",id:record.id,received:true,signaturesChecked:index===1 || checks[1],datesChecked:index===2 || checks[2],reason:`Form received and checked directly by ${owner}.`},`${record.childName}: ${CHECKLIST_STEPS[index].toLowerCase()} recorded.`);
      return <tr key={record.id} className={dueFlag ? "tscc-deadline-flag" : ""}><td><strong>{record.childName}</strong><p>{record.submissionDueDate ? `Due ${record.submissionDueDate}` : "Deadline needs setup"}{dueFlag && <strong className="tscc-checklist-missing"> · {dueFlag}</strong>}</p><p>Responsible: {owner}</p><p>{record.servicePeriod}<br/>{record.location}<br/>{record.timesheetType}</p><p className={route?.verified ? "" : "tscc-checklist-missing"}>{route?.verified ? route.email : "Agency email needs verification"}</p>{Boolean(record.submissionIssue) && <strong className="tscc-checklist-missing">Correction required</strong>}</td>
        {checks.map((done,index)=><td key={CHECKLIST_STEPS[index]}>{index<3 ? <label className="tscc-checklist-check"><input type="checkbox" aria-label={`${CHECKLIST_STEPS[index]}: ${record.childName}`} checked={done} disabled={locked || done || (index>0 && !checks[0])} onChange={()=>void mark(index)} /><span>{done ? "Recorded" : "Pending"}</span></label> : <span className={`tscc-chip ${done ? "green" : ""}`}>{done ? "✓ Recorded" : "Pending"}</span>}</td>)}
        <td><span className={`tscc-chip ${record.jenReviewedAt ? "green" : ""}`}>{tehachapi ? checks[5] ? "Jennifer submitted" : "Jennifer handles submission" : record.jenReviewedAt ? "✓ Reviewed" : checks[5] ? "Ready for Jen" : "Waiting for submission"}</span></td><td><div className="tscc-checklist-actions"><button className="tscc-btn light" disabled={saving} onClick={()=>onOpen(record.id)}>{checks[3] ? "Review form" : checks.slice(0,3).every(Boolean) ? "Fill out form" : "Open form"}</button>{canProcess && <button className="tscc-btn light" disabled={saving} onClick={()=>onOpen(record.id)}>Funding / location</button>}<button className="tscc-btn light" disabled={saving} onClick={()=>onBatch(record.id)}>{(record.canReviewSubmission ?? canReview) ? "Review submission" : "Record scan / email"}</button></div></td>
      </tr>;
    })}</tbody></table>{!rows.length && <div className="tscc-empty">No timesheets match these filters. Choose the service month for the forms you are processing.</div>}</div>
  </section>;
}
