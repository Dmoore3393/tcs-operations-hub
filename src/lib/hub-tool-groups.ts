import {translateText} from './i18n/translate';
/** Shared, plain-language menu sections. Callers filter permissions before grouping. */
const sections=[
 {title:'Everyday',paths:['/','/time-clock','/my-schedule','/communications','/notifications','/transportation','/transportation-v2']},
 {title:'Children & care',paths:['/children','/attendance','/daily-care','/meals','/child-schedules','/family-care-calendar','/health-safety','/emergency-cards','/school-age-support','/student-store','/child-photos','/weekly-checkins']},
 {title:'My team',paths:['/employee-lounge','/employee-bulletin','/time-off','/training-center','/team-store','/organization']},
 {title:'Staff & planning',paths:['/employees','/staff-onboarding','/staff-schedules','/scheduling','/staff-performance','/employee-checkins','/ratios','/work-plans','/shift-reports','/maintenance']},
 {title:'Families',paths:['/families','/family-access','/family-communications','/family-matters','/newsletters']},
 {title:'Office & setup',paths:[]},
];
export function groupHubTools<T extends {href:string;label:string}>(items:T[],query=''){
 const term=query.trim().toLowerCase();const groups=sections.map(section=>({title:section.title,items:[] as T[]}));
 for(const item of items){if(term&&!`${item.label} ${translateText(item.label,'es')} ${item.href}`.toLowerCase().includes(term))continue;const index=sections.findIndex(section=>section.paths.includes(item.href));groups[index<0?groups.length-1:index].items.push(item);}
 return groups.filter(group=>group.items.length);
}
export function toolSectionOpen(group:{title:string;items:{href:string}[]},pathname:string,query=''){
 return Boolean(query.trim())||group.title==='Everyday'||group.items.some(item=>pathname===item.href||(item.href!=='/'&&pathname.startsWith(item.href+'/')));
}
