import spanish from './es.json';
export type Language='en'|'es';
const messages:Record<string,string>=spanish;
const caseInsensitiveMessages=new Map(Object.entries(messages).map(([key,value])=>[key.toLowerCase(),value]));
const weekdays:Record<string,string>={Monday:'lunes',Tuesday:'martes',Wednesday:'miércoles',Thursday:'jueves',Friday:'viernes',Saturday:'sábado',Sunday:'domingo',Mon:'lun',Tue:'mar',Wed:'mié',Thu:'jue',Fri:'vie',Sat:'sáb',Sun:'dom'};
const months:Record<string,string>={January:'enero',February:'febrero',March:'marzo',April:'abril',May:'mayo',June:'junio',July:'julio',August:'agosto',September:'septiembre',October:'octubre',November:'noviembre',December:'diciembre',Jan:'ene',Feb:'feb',Mar:'mar',Apr:'abr',Jun:'jun',Jul:'jul',Aug:'ago',Sep:'sep',Oct:'oct',Nov:'nov',Dec:'dic'};
export function translateText(value:string,language:Language){
 if(language==='en'||!value.trim())return value;
 const trimmed=value.replace(/\s+/g,' ').trim();let translated=messages[trimmed];
 if(!translated){const match=caseInsensitiveMessages.get(trimmed.toLowerCase());if(match)translated=trimmed===trimmed.toUpperCase()?match.toLocaleUpperCase('es'):match;}
 if(!translated){
  // Translate rendered dates and fixed interface prefixes; preserve captured names and numbers.
  const date=trimmed.match(/^(?:(Due by|Due|Effective)\s+)?(?:(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+)?(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:,?\s+(\d{4}))?$/);
  if(date)translated=`${date[1]?(date[1]==='Effective'?'Vigente desde ': 'Vence '):''}${date[2]?weekdays[date[2]]+', ':''}${date[4]} de ${months[date[3]]}${date[5]?' de '+date[5]:''}`;
  else if(/^(Morning|Afternoon) • /.test(trimmed))translated=trimmed.replace(/^Morning/,'Mañana').replace(/^Afternoon/,'Tarde');
 }
 return translated?value.replace(value.trim(),translated):value;
}
/** For native confirmation dialogs, which are outside the React render tree. */
export function translateForDevice(value:string){return translateText(value,typeof document!=='undefined'&&document.documentElement.lang==='es'?'es':'en');}
