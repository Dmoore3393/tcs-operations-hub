import {PDFDocument,rgb,type PDFFont} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type {Facility,RosterRow} from './model';
const columns=[36,161.3,286.5,407.3,527.2,648,701.3,756];
export function wrapRosterText(text:string,font:PDFFont,width:number,size=8.5){
 const lines:string[]=[];for(const paragraph of text.replace(/\r/g,'').split('\n')){let line='';for(const word of paragraph.split(/\s+/).filter(Boolean)){if(line&&font.widthOfTextAtSize(line+' '+word,size)>width){lines.push(line);line='';}for(const character of (line?' ':'')+word){if(line&&font.widthOfTextAtSize(line+character,size)>width){lines.push(line);line='';}line+=character;}}lines.push(line);}return lines;
}
/** The original official page is repeated unchanged. Overflow continues through additional official rows/pages. */
export async function createLic9040(template:Uint8Array,fontBytes:Uint8Array,facility:Facility,rows:RosterRow[],date:string){
 const output=await PDFDocument.create();output.registerFontkit(fontkit);const font=await output.embedFont(fontBytes,{subset:true});
 const background=await PDFDocument.load(template);const embedded=await output.embedPage(background.getPages()[0]);
 const printable:string[][][]=[];
 rows.forEach((r,index)=>{const cells=[`${r.name}\n${r.birthdate}`,r.address,r.guardians.map((g,n)=>`${n+1}. ${g.name}`).join('\n'),r.guardians.map((g,n)=>`${n+1}. ${g.phone}`).join('\n'),[r.physician,r.physicianPhone].filter(Boolean).join('\n'),r.enrolled,r.left];const lines=cells.map((c,n)=>wrapRosterText(c,font,columns[n+1]-columns[n]-8,n>=5?7.5:8.5));const count=Math.max(1,...lines.map(l=>Math.ceil(l.length/3)));for(let slot=0;slot<count;slot++){const chunk=lines.map(l=>l.slice(slot*3,slot*3+3));if(!chunk[0].some(Boolean))chunk[0]=[`Entry ${index+1} (continued)`];printable.push(chunk);}});
 const pageCount=Math.max(1,Math.ceil(printable.length/10));
 for(let n=0;n<pageCount;n++){
  const page=output.addPage([792,612]);page.drawPage(embedded,{x:0,y:0,width:792,height:612});
  const draw=(value:string,x:number,top:number,width:number,maxLines:number,size:number)=>{const lines=wrapRosterText(value,font,width,size);if(lines.length>maxLines)throw new Error('Facility header is too long. Shorten the verified facility display name before exporting.');lines.forEach((line,i)=>page.drawText(line,{x,y:612-top-i*(size+1.5),size,font,color:rgb(0,0,0)}));};
  draw(facility.facility_name||'FACILITY NAME MISSING',40,159,402,2,8.5);draw(facility.license_number||'NOT VERIFIED',453,159,150,1,8.5);draw(date,616,159,133,1,8.5);
  printable.slice(n*10,n*10+10).forEach((cells,row)=>cells.forEach((lines,col)=>lines.forEach((line,k)=>page.drawText(line,{x:columns[col]+4,y:612-(194+10+row*36+k*10),size:col>=5?7.5:8.5,font,color:rgb(0,0,0)}))));
  page.drawText(`Hub snapshot ${date} | Page ${n+1} of ${pageCount}`,{x:480,y:29,size:7,font,color:rgb(.25,.25,.25)});
 }
 output.setTitle(`LIC 9040 - ${facility.facility_name||'Location roster'} - ${date}`);output.setSubject('Official LIC 9040 (10/05), dated location-specific roster snapshot');return output.save();
}

export async function createChecklistPdf(fontBytes:Uint8Array,facility:Facility,files:{person_name:string;items:{name:string;status:string;note:string;expirationDate:string}[]}[],date:string){
 const output=await PDFDocument.create();output.registerFontkit(fontkit);const font=await output.embedFont(fontBytes,{subset:true});
 let page=output.addPage([612,792]),y=740;
 const header=()=>{page.drawText('Location child-file inspection checklist',{x:36,y:760,size:13,font});page.drawText(`${facility.facility_name||'Location'} | ${date}`,{x:36,y:742,size:9,font});y=720;};header();
 for(const file of files){const lines=[...wrapRosterText(file.person_name,font,532,9),...file.items.flatMap(i=>wrapRosterText(`${i.name}: ${i.status}${i.expirationDate?' | Expires '+i.expirationDate:''}${i.note?' | '+i.note:''}`,font,532,9)), ''];for(const line of lines){if(y<40){page=output.addPage([612,792]);header();}page.drawText(line,{x:36,y,size:9,font});y-=13;}}
 return output.save();
}
