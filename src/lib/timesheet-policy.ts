/** TCS policy effective with October 2026 forms, starting November 1, 2026. */
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
export function timesheetPolicyApplies(period: string) {
  const [month, year] = period.trim().split(/\s+/);
  const index = MONTHS.indexOf(month);
  return index >= 0 && /^\d{4}$/.test(year || '') && Number(year)*12+index >= 2026*12+9;
}
export function timesheetDeadline(period: string, type: string) {
  if (!timesheetPolicyApplies(period)) return '';
  const [month, year] = period.trim().split(/\s+/);
  const day = type === 'CCRC Stage 2' ? 5 : ['CCRC Stage 1','CCCC','DCFS'].includes(type) ? 1 : 0;
  if (!day) return '';
  return new Date(Date.UTC(Number(year),MONTHS.indexOf(month)+1,day,12)).toISOString().slice(0,10);
}
export function applyTimesheetPolicy(record: Record<string, unknown>, period: string, type: string) {
  if (!timesheetPolicyApplies(period)) return record;
  const due = timesheetDeadline(period,type);
  return {...record,submissionControlVersion:3,workflowOwner:'Danielle',workflowReviewer:'Jennifer',...(due ? {submissionDueDate:due} : {})};
}
export function timesheetDeadlineFlag(due: string, submitted: boolean, today: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || submitted || today < due) return '';
  return today === due ? 'Due today' : 'Overdue';
}

export function timesheetStepLabel(stage:string,currentWorkflow=true) {
  if(!currentWorkflow)return stage;
  return ({'Location Sign-Off':'Receipt, signatures and dates','Danielle Fill Out':'Danielle: fill out','Scan & Send to Jennifer':'Danielle: scan','Jennifer Email':'Danielle: submit to agency','Licensee Verification':'Jen: final review','Complete':'Reviewed by Jen'} as Record<string,string>)[stage] || stage;
}
