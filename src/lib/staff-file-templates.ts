import type { ChildFileAuditTemplate } from "@/lib/child-file-audits";

// Physical-file order from Danielle's May 27 chat and original SAC checklist image.
// These are program packet labels, not a declaration that every item is legally mandatory.
export const inHomeStaffFileOrder = [
 "Resume", "Degree / Permits", "School Transcripts", "Guardian Clearance Letter",
 "Criminal Background Clearance Transfer", "Exemption Approval", "Criminal Record Statement",
 "Driver’s License / Identification", "Statement Acknowledging Requirement to Report Child Abuse",
 "AB1207 Mandated Reporter Training Certificate", "CPR / First Aid", "Preventive Health Practices",
 "MMR", "Tdap", "TB Test / Assessment", "Influenza Declination / Proof", "W-4",
 "EDD Withholding", "I-9 Employment Eligibility Verification", "Social Security Card Copy",
 "Job Description", "Employment Agreement", "Meal Breaks Form", "CalSavers",
 "Facility Surveillance Notification", "LIC 9025 — original checklist label; verify form number",
 "Employee Handbook Acknowledgement",
] as const;
export const centerStaffFileOrder = [
 "Resume", "Clearance or Exemption Letter", "Criminal Background Exemption Transfer Request",
 "LIC 9182 – Criminal Background Clearance Transfer Request", "LIC 508 – Criminal Record Statement",
 "Valid Driver License OR DMV Identification Card",
 "LIC 9108 – Statement Acknowledging Requirement to Report Child Abuse",
 "Mandated Reporter Training Certificate", "Valid CPR Training Certificate",
 "Preventative Health and Safety Training Certificate", "Health Screening Report Facility Personnel",
 "Current Immunization Record", "MMR", "TDAP", "Negative TB Results (within 1 year to date)",
 "Negative TB X-Ray", "Declination of Influenza Vaccination",
 "W-4 – Employee’s Withholding Certificate", "EDD – Employee’s Withholding Allowance Certificate",
 "I-9 Employment Eligibility Verification Form", "Copy of Social Security Card", "LIC 501 – Personnel Record",
 "College Transcript and/or Degrees / Permits Child Development", "TCS Job Description",
 "TCS Employment Agreement", "TCS Lunch Breaks", "TCS CalSavers Retirement Savings",
 "Consent of Video Surveillance", "LIC 9052 – Notice Employee Rights", "TCS Employee Handbook Acknowledgement",
] as const;
export function staffFileTemplate(template: ChildFileAuditTemplate) {
 const center = template === "School Age Center";
 return (center ? centerStaffFileOrder : inHomeStaffFileOrder).map((name,index)=>({
  id:`staff-${index+1}`, name:`${index+1}. ${name}`,
  section: center ? (index<6?"1. Hiring / Background / Identification":index<17?"2. Training / Health / Licensing Requirements":index<23?"3. Employment / Payroll Documents":"4. Company Policies / Acknowledgements") : "In-home employee packet — original file order",
  requirement:center&&[2,3,15].includes(index)?"If Applicable — original checklist":"Program checklist item — confirm applicability for this role and site",
 }));
}
export function staffTemplateSource(template: ChildFileAuditTemplate) {
 return template === "School Age Center"
 ? "30 items in the original School Age Center Employee File Checklist image, preserving its four sections and order. Original labels are retained; verify current applicability before marking N/A or setting expiry. No automatic annual TB expiry is imposed."
 : "27 items in the May 27 in-home Employee File Cheat Guide, preserving original order. Item 26 was written LIC 9025 in that chat; verify against the physical packet (the center checklist uses LIC 9052). Current applicability must be reviewed; original labels do not establish legal requirements.";
}
