import 'server-only';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {PDFDocument,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {inspectionScore} from '../pop-up-inspections';
import type {ReleasedInspection,InspectionCorrection} from '../inspection-results';
export async function inspectionReportPdf(visit:ReleasedInspection,tasks:InspectionCorrection[]){
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
 const font=await pdf.embedFont(await readFile(join(process.cwd(),'public/forms/RosterSans.ttf')),{subset:true});
 let page=pdf.addPage([612,792]),y=740;const margin=42,width=528;
 const clean=(s:string)=>s.replace(/[\u0000-\u0008\u000b-\u001f]/g,'');
 function line(text:string,size=10){if(y<55){page=pdf.addPage([612,792]);y=740;}page.drawText(text,{x:margin,y,size,font,color:rgb(.05,.15,.1)});y-=size+6;}
 function write(text:string,size=10){for(const paragraph of clean(text).split('\n')){let value='';for(let word of paragraph.split(/\s+/)){
  if(value&&font.widthOfTextAtSize(value+' '+word,size)>width){line(value,size);value='';}
  while(font.widthOfTextAtSize(word,size)>width){let end=Math.min(word.length,90);while(end>1&&font.widthOfTextAtSize(word.slice(0,end),size)>width)end--;line(word.slice(0,end),size);word=word.slice(end);}
  value+=(value?' ':'')+word;
 }line(value,size);}}
 const score=inspectionScore(visit.document.items);
 write('TCS Operations Hub | Pop-up Inspection',18);write(visit.location_name+' | Visit: '+visit.inspection_date,13);
 write('Final internal grade: '+(score.percent===null?'Not scored':score.percent+'% - '+score.label),13);
 write('Inspector(s): '+visit.document.inspectedBy);write('Released: '+visit.released_at.slice(0,10));
 write('Internal readiness review, not a state-issued inspection or licensing grade.');
 write('Correction checklist',15);
 if(!tasks.length)write('No corrections assigned.');
 for(const task of tasks){write((task.status==='Resolved'?'[x] ':'[ ] ')+(task.urgent?'URGENT: ':'')+task.item_name,11);write(task.correction);write('Responsible: '+task.assignee_name+' | Due: '+task.due_date+' | '+task.status);if(task.submission)write('Submitted correction: '+task.submission);if(task.review_note)write('Reviewer: '+task.review_note);y-=8;}
 write('Inspection results',15);
 const labels={meets:'Meets expectations',partial:'Needs improvement',needs_attention:'Needs correction',na:'Not applicable','':'Not reviewed'};
 for(const item of visit.document.items){write(item.category+' | '+labels[item.rating]+(item.urgent?' | URGENT':''),11);write(item.label);if(item.notes)write('Observation / correction: '+item.notes);y-=6;}
 const pages=pdf.getPages();pages.forEach((p,i)=>p.drawText(visit.location_name+' | '+visit.inspection_date+' | '+(i+1)+' of '+pages.length,{x:42,y:24,size:8,font}));
 return pdf.save();
}
