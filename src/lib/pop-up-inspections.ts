export type Rating=''|'meets'|'partial'|'needs_attention'|'na';
export type InspectionItem={id:string;category:string;label:string;rating:Rating;notes:string;urgent:boolean;reference?:string;sourceUrl?:string};
export type InspectionDocument={program:InspectionProgram;templateVersion:string;items:InspectionItem[];notes:string;followUp:string;inspectedBy:string};
export type Inspection={id:string;location_id:string;inspection_date:string;status:'draft'|'completed';document:InspectionDocument;version:number;updated_at:string;created_by:string;updated_by:string};
export type InspectionProgram='home'|'school_age';
export const inspectionSources={
 homeTool:'https://cdss.ca.gov/Portals/9/CCL/Inspection%20Process/Family%20Child%20Care%20Homes%20Standard%20Tool.xlsx',
 centerTool:'https://cdss.ca.gov/Portals/9/CCL/Inspection%20Process/Child%20Care%20Centers%20-%20School-Age%20Standard%20Tool.xlsx',
 homeEntrance:'https://www.cdss.ca.gov/Portals/9/Additional-Resources/Forms-and-Brochures/2020/I-L/LIC126.pdf?ver=2021-03-24-163146-703',
 centerEntrance:'https://www.cdss.ca.gov/Portals/9/Additional-Resources/Forms-and-Brochures/2020/I-L/LIC125.pdf?ver=2021-03-24-162938-637',
 homeRecords:'https://www.cdss.ca.gov/Portals/9/Additional-Resources/Forms-and-Brochures/2020/I-L/LIC311D.pdf?ver=2022-08-10-140050-717',
 centerRecords:'https://www.cdss.ca.gov/Portals/9/Additional-Resources/Forms-and-Brochures/2020/I-L/LIC311A.pdf?ver=2022-04-12-084631-213'
};
type Check=[category:string,label:string,reference:string,source:keyof typeof inspectionSources];
const home:Check[]=[
 ['Capacity & supervision','Count children present, including resident children where required; verify the licensed capacity, age mix and assistant coverage.','22 CCR 102416.5','homeTool'],
 ['Capacity & supervision','Verify the licensee is present or a qualified substitute is supervising; children are supervised throughout the visit.','22 CCR 102417(a)','homeTool'],
 ['Safety & physical environment','Inspect rooms, floors, furniture and outdoor areas for unsafe conditions; check cleanliness, heating and ventilation.','22 CCR 102417(b), (g)','homeTool'],
 ['Safety & physical environment','Check that toys and equipment are safe and not banned or recalled; no baby walkers are on the premises.','22 CCR 102417(d), (g)(10)','homeTool'],
 ['Safety & physical environment','Verify stairs are fenced or barricaded when children younger than five are in care.','22 CCR 102417(g)(3)','homeTool'],
 ['Safety & physical environment','Check fireplace / heater guards, working smoke alarms and a serviceable fire extinguisher.','22 CCR 102417(g)(1)','homeTool'],
 ['Safety & physical environment','Verify working carbon monoxide detection.','HSC 1597.543','homeTool'],
 ['Safety & physical environment','Check that poisons are locked and cleaning products, medicines and other dangerous items are inaccessible.','22 CCR 102417(g)(4)','homeTool'],
 ['Safety & physical environment','If weapons are present, verify permitted secure storage and ammunition locked separately; inspect the actual storage.','22 CCR 102417(g)(4)(A)–(C)','homeTool'],
 ['Safety & physical environment','If a pool, spa or other water hazard is present, inspect barriers, gates and applicable drowning-prevention protections.','22 CCR 102417(g)(5); HSC 1596.814','homeTool'],
 ['Safety & physical environment','Verify working telephone service and no smoking on the premises.','22 CCR 102417(c); 102424','homeTool'],
 ['Emergency readiness','Review the written emergency plan, evacuation arrangements and earthquake-preparedness information.','LIC 610A / LIC 9148; 22 CCR 102417(g)(9)','homeRecords'],
 ['Emergency readiness','Check the recorded dates and times of fire / disaster drills; verify drills at least every six months.','22 CCR 102417(g)(9)(A)','homeTool'],
 ['Personal rights & care','Observe respectful treatment and safe accommodations; check for prohibited punishment, humiliation or interference with eating, sleeping or toileting.','22 CCR 102423','homeTool'],
 ['Personal rights & care','Check how illness is identified, affected children are separated and parents are contacted while supervision continues.','22 CCR 102417(e)','homeTool'],
 ['Food & hygiene','Check that food brought from home is labeled with the child’s name and safely stored / refrigerated.','22 CCR 102417(f)','homeTool'],
 ['Staff & household records','Verify criminal-record clearance / exemption and required association for adults subject to background checks, including applicable household adults.','HSC 1596.871; LIC 311D','homeTool'],
 ['Staff & household records','Review current pediatric CPR / first aid and required preventive-health training records.','LIC 126 / LIC 311D','homeEntrance'],
 ['Staff & household records','Review TB clearance / risk assessment, staff immunization or permitted exemption / declination records.','LIC 126 / LIC 311D','homeEntrance'],
 ['Staff & household records','Check mandated reporter training and signed staff acknowledgments / employee rights records.','LIC 9108 / LIC 9052; LIC 311D','homeRecords'],
 ['Children’s files & roster','Reconcile enrolled children with this location’s current LIC 9040 roster.','LIC 126 / LIC 311D','homeRecords'],
 ['Children’s files & roster','Sample child files for current emergency contacts, authorized adults and emergency-treatment consent.','LIC 700 / LIC 627','homeRecords'],
 ['Children’s files & roster','Verify parent-rights and background-check notices and consumer-awareness information were provided.','LIC 995A / LIC 995E / LIC 9212','homeRecords'],
 ['Children’s files & roster','Check immunization documentation for children who require it; account for elementary-school enrollment applicability.','LIC 311D; 22 CCR 102418','homeRecords'],
 ['Children’s files & roster','Check liability-insurance acknowledgment if uninsured / unbonded and required additional-child / school-enrollment records when using expanded capacity.','LIC 282 / LIC 9150; 22 CCR 102421(c)','homeRecords'],
 ['Medication & special care','If medication or medical procedures are provided, verify permissions, care instructions and applicable records.','LIC 9221 / LIC 9166 / LIC 9222; LIC 126','homeRecords'],
 ['Postings & administration','Verify the facility license, parent-rights poster and applicable waivers are displayed / available as required.','LIC 126; PUB 394','homeEntrance'],
 ['Postings & administration','Review required licensing-report postings, parent acknowledgments and previous corrections.','LIC 9213 / LIC 9224; LIC 311D','homeRecords'],
 ['Postings & administration','Check incident / injury reporting records and required facility / property documents.','LIC 624B / LIC 9149 / LIC 9151; LIC 311D','homeRecords'],
 ['Infant safe sleep—if applicable','Inspect individual compliant cribs / play yards, firm fitted mattresses, safe placement and clean individual bedding.','22 CCR 102425(a)','homeTool'],
 ['Infant safe sleep—if applicable','Check sleep spaces are clear of loose objects, bumpers and attached objects; review safe pacifier use.','22 CCR 102425(b)','homeTool'],
 ['Infant safe sleep—if applicable','Review infant positioning, monitoring and documented sleep checks against the safe-sleep requirements.','22 CCR 102425','homeTool'],
 ['Infant safe sleep—if applicable','Check an individual sleep plan for infants up to 12 months and sleep logs for infants up to 24 months.','LIC 9227; LIC 311D','homeRecords']
];
const center:Check[]=[
 ['Capacity & supervision','Count children by group and verify licensed capacity, age limits and school-age staffing / teacher-aide ratios, including mixed-age groups.','22 CCR 101516.5','centerTool'],
 ['Capacity & supervision','Observe supervision throughout indoor / outdoor activities and transitions; children are not left unsupervised.','22 CCR 101229','centerTool'],
 ['Capacity & supervision','Verify qualified director / substitute coverage, teacher and aide qualifications and supervision of aides.','22 CCR 101515; 101215.1; 101216.2','centerTool'],
 ['Safety & physical environment','Inspect the building, floors, furniture and equipment for cleanliness, damage, pests and hazards.','22 CCR 101238; 101239','centerTool'],
 ['Safety & physical environment','Check that exits, passageways and stairs are unobstructed and the approved fire clearance is available.','22 CCR 101238(c); 101171','centerTool'],
 ['Safety & physical environment','Check working smoke / carbon-monoxide alarms, fire extinguisher and telephone service.','LIC 125; HSC 1596.954; 22 CCR 101224','centerEntrance'],
 ['Safety & physical environment','Check poisons are locked, dangerous products inaccessible and medicines stored separately from cleaning supplies.','22 CCR 101238(g)–(h)','centerTool'],
 ['Safety & physical environment','Verify firearms and other weapons are not on or stored at the center.','22 CCR 101238(g)(2)','centerTool'],
 ['Safety & physical environment','Inspect playground enclosure, fall cushioning, safe surfaces, shade and equipment anchoring; check sandboxes if present.','22 CCR 101238.2; 101239(o)','centerTool'],
 ['Safety & physical environment','If water hazards are present, check required barriers / covers and protections.','22 CCR 101238(e)','centerTool'],
 ['Safety & physical environment','Check toilets / handwashing supplies, sanitary fixtures, school-age privacy and individual storage for belongings.','22 CCR 101239; 101539; 101238.4','centerTool'],
 ['Safety & physical environment','Check drinking water indoors / outdoors and, for applicable pre-2010 buildings, water-lead testing and corrective records.','22 CCR 101239.2; HSC 1597.16','centerTool'],
 ['Emergency readiness','Review the emergency plan, staff roles, evacuation / reunification arrangements and earthquake-preparedness records.','LIC 610 / LIC 9148; 22 CCR 101174','centerRecords'],
 ['Emergency readiness','Check fire / disaster drills occur at least every six months and drill documentation is retained.','LIC 311A; 22 CCR 101174','centerRecords'],
 ['Personal rights & care','Observe respectful interactions and safe accommodations; check for prohibited punishment, humiliation or interference with eating, sleeping or toileting.','22 CCR 101223','centerTool'],
 ['Personal rights & care','Check daily illness screening, supervision of ill children and appropriate health / first-aid response.','22 CCR 101226; 101226.1','centerTool'],
 ['Personal rights & care','Check age-appropriate quiet / active activities and daily routines meet children’s needs.','22 CCR 101230','centerTool'],
 ['Food service','Review posted advance menus, dated menu records and required meals / snacks for the program served.','22 CCR 101227','centerTool'],
 ['Food service','Inspect safe food storage, contamination prevention, food temperatures, kitchen sanitation and separation of chemicals from food.','22 CCR 101227(a)','centerTool'],
 ['Food service','Verify staff follow documented allergies / special-diet instructions and safe food-service practices.','CARE Tool—Care and Supervision / Food Service','centerTool'],
 ['Staff records','Verify background clearances / exemptions and required association for staff subject to fingerprinting.','HSC 1596.871; 22 CCR 101170','centerTool'],
 ['Staff records','Review staff qualification documents, transcripts / permits and personnel records for people working today.','LIC 125 / LIC 311A; 22 CCR 101217','centerRecords'],
 ['Staff records','Verify current pediatric CPR / first aid coverage and required health / safety training.','22 CCR 101216(f); LIC 311A','centerTool'],
 ['Staff records','Check staff health screening / TB and immunization or permitted exemption / declination records.','LIC 503; LIC 125 / LIC 311A','centerRecords'],
 ['Staff records','Review mandated reporter training and signed abuse-reporting / employee-rights acknowledgments.','LIC 9108 / LIC 9052; LIC 311A','centerRecords'],
 ['Children’s files & roster','Reconcile children enrolled at this location with the current LIC 9040 roster.','LIC 311A—Administrative Records','centerRecords'],
 ['Children’s files & roster','Check complete sign-in / sign-out records and the required recent attendance records.','LIC 125 / LIC 311A','centerRecords'],
 ['Children’s files & roster','Sample child files for current emergency contacts, authorized adults and emergency-treatment consent.','LIC 700 / LIC 627; 22 CCR 101221','centerRecords'],
 ['Children’s files & roster','Check signed admission agreements, parent-rights / personal-rights receipts and applicable licensing-report acknowledgments.','LIC 995 / LIC 613A / LIC 9224; LIC 311A','centerRecords'],
 ['Children’s files & roster','Check health-history records and applicable physician / immunization records; do not require the latter where elementary-school enrollment provides the stated exception.','LIC 702 / LIC 701; LIC 311A','centerRecords'],
 ['Medication & special care','If medication is handled, inspect child-labeled storage, written permissions, instructions and medication records.','22 CCR 101226(e); LIC 311A','centerTool'],
 ['Postings & administration','Review posted license, parent / personal rights, menus, activity schedule, facility sketch and passenger-restraint information as applicable.','LIC 125 / LIC 311A','centerEntrance'],
 ['Postings & administration','Review required licensing-report postings, prior corrections, report availability and parent acknowledgments.','HSC 1596.8595; LIC 311A','centerRecords'],
 ['Postings & administration','Check unusual incident / injury reports and required reporting follow-up.','LIC 624; CARE Tool—Reporting Requirements','centerRecords'],
 ['Transportation—if provided','Verify drivers have the appropriate license and required transportation permissions / arrangements are documented.','22 CCR 101225; LIC 311A','centerTool']
];
export function newInspectionDocument(program:InspectionProgram='home'):InspectionDocument{
 const checks=program==='home'?home:center;
 return {program,templateVersion:'CDSS-CARE-2026-11-18',items:checks.map(([category,label,reference,source],n)=>({id:program+'-'+n,category,label,reference,sourceUrl:inspectionSources[source],rating:'',notes:'',urgent:false})),notes:'',followUp:'',inspectedBy:''};
}
export function inspectionScore(items:InspectionItem[]){
 const scored=items.filter(i=>i.rating&&i.rating!=='na'),reviewed=items.filter(i=>i.rating).length;
 const percent=scored.length?Math.round(scored.reduce((n,i)=>n+(i.rating==='meets'?1:i.rating==='partial'?0.5:0),0)/scored.length*100):null;
 return {percent,reviewed,total:items.length,remaining:items.length-reviewed,corrections:items.filter(i=>['partial','needs_attention'].includes(i.rating)),urgent:items.filter(i=>i.urgent),label:percent===null?'No scored items':percent>=90?'Strong':percent>=75?'Follow-up needed':'Needs attention'};
}
export function validInspectionDocument(value:unknown):value is InspectionDocument{
 if(!value||typeof value!=='object')return false;
 const d=value as InspectionDocument,short=(v:unknown,max:number)=>typeof v==='string'&&v.length<=max;
 return ['home','school_age'].includes(d.program)&&short(d.templateVersion,100)&&short(d.notes,10000)&&short(d.followUp,10000)&&short(d.inspectedBy,500)&&Array.isArray(d.items)&&d.items.length>0&&d.items.length<=100&&new Set(d.items.map(i=>i?.id)).size===d.items.length&&d.items.every(i=>i&&short(i.id,100)&&i.id.trim()&&short(i.category,150)&&i.category.trim()&&short(i.label,500)&&i.label.trim()&&['','meets','partial','needs_attention','na'].includes(i.rating)&&short(i.notes,5000)&&typeof i.urgent==='boolean'&&(i.reference===undefined||short(i.reference,500))&&(i.sourceUrl===undefined||Object.values(inspectionSources).includes(i.sourceUrl)));
}
