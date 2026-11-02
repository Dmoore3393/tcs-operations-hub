import {LocalizedNative,LocalizedText} from '@/components/i18n/LocalizedElements';
import {jsx as reactJsx} from 'react/jsx-runtime';
const raw=new Set(['html','head','body','script','style','link','meta','title','base','noscript','code','pre','svg','path','g','circle','rect','line','polygon','polyline','ellipse','defs','clipPath','mask','linearGradient','radialGradient','stop','use']);
export function prepare(type:unknown,props:Record<string,unknown>|null){
 if(typeof type==='string'&&!raw.has(type))return {type:LocalizedNative,props:{tag:type,originalProps:props||{}}};
 if(typeof type!=='string'&&props&&typeof props.children==='string'&&(props.href||props.onClick))return {type,props:{...props,children:reactJsx(LocalizedText,{text:props.children})}};
 return {type,props};
}
