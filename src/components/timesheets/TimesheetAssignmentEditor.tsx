"use client";
import {useState} from "react";

export type AssignmentRecord = {
 id:string;childName:string;servicePeriod:string;timesheetType:string;fundingLocationId:string;careLocationId:string;updatedAt:string;
 childAssignment:{updatedAt:string;careLocationId:string;fundingLocationId:string;funding:string}|null;
};
const PROGRAMS=["CCRC Stage 1","CCRC Stage 2","CCCC","DCFS","Respite"];
export default function TimesheetAssignmentEditor({record,locations,saving,onAction}:{record:AssignmentRecord;locations:{id:string;name:string}[];saving:boolean;onAction:(body:Record<string,unknown>,message:string)=>Promise<unknown>}){
 const [scope,setScope]=useState("both");
 const [care,setCare]=useState(record.careLocationId || record.childAssignment?.careLocationId || "");
 const [funding,setFunding]=useState(record.fundingLocationId);
 const [program,setProgram]=useState(record.timesheetType);
 const [notice,setNotice]=useState("");
 const changeScope=(value:string)=>{
  setScope(value);setNotice("");
  setCare(value==="profile" ? record.childAssignment?.careLocationId || "" : record.careLocationId || record.childAssignment?.careLocationId || "");
  setFunding(value==="profile" ? record.childAssignment?.fundingLocationId || "" : record.fundingLocationId);
  setProgram(value==="profile" ? record.childAssignment?.funding || "" : record.timesheetType);
 };
 return <section className="tscc-stage-card current" aria-label="Funding and location editor"><h3>Change funding &amp; location</h3>
  <p>Care location is where the child attends. Funding location is the authorization location used for agency submission.</p>
  {!record.childAssignment ? <p role="status">This form has no linked child profile. Link the correct child before changing its assignment.</p> : <>
   <label className="tscc-assignment-field">Apply changes to<select className="tscc-select" disabled={saving} value={scope} onChange={event=>changeScope(event.target.value)}><option value="both">This form and child profile for future forms</option><option value="form">This form only — {record.servicePeriod}</option><option value="profile">Child profile only — future forms</option></select></label>
   <label className="tscc-assignment-field">Care location<select className="tscc-select" disabled={saving} value={care} onChange={event=>setCare(event.target.value)}><option value="">Choose care location</option>{locations.map(site=><option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
   <label className="tscc-assignment-field">Funding / authorization location<select className="tscc-select" disabled={saving} value={funding} onChange={event=>setFunding(event.target.value)}><option value="">Choose funding location</option>{locations.map(site=><option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
   <label className="tscc-assignment-field">Funding program<select className="tscc-select" disabled={saving} value={program} onChange={event=>setProgram(event.target.value)}><option value="">Choose funding program</option>{[...PROGRAMS,...(scope==="profile" ? ["Cash Pay"] : [])].map(type=><option key={type}>{type}</option>)}</select></label>
   <p>{scope==="profile" ? "Updates the child profile without changing this month’s form. Cash Pay does not create agency timesheets." : `Updates ${record.servicePeriod} only${scope==="both" ? " and the child profile for future forms" : ""}. Other existing months keep their assignments. Changed form details require the form to be filled out and verified again. Reopen a scanned or submitted batch first.`}</p>
   <button className="tscc-btn primary" disabled={saving || !care || !funding || ![...PROGRAMS,...(scope==="profile" ? ["Cash Pay"] : [])].includes(program)} onClick={async()=>{setNotice("");if(await onAction({action:"setAssignment",id:record.id,scope,careLocationId:care,fundingLocationId:funding,timesheetType:program,expectedUpdatedAt:record.updatedAt,expectedChildUpdatedAt:record.childAssignment?.updatedAt},`${record.childName}: funding and location saved.`))setNotice("Funding and location saved.");}}>Save funding &amp; location</button>{notice && <p role="status">{notice}</p>}
  </>}
 </section>;
}
