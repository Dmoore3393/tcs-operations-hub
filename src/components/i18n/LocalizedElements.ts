"use client";
import {createContext,createElement,useContext,type ElementType,type ReactNode} from 'react';
import {useLanguage} from './LanguageProvider';
const Skip=createContext(false);
function displayChildren(value:ReactNode,t:(value:string)=>string):ReactNode{return typeof value==='string'?t(value):Array.isArray(value)?value.map(child=>displayChildren(child,t)):value;}
export function LocalizedText({text}:{text:string}){const {t}=useLanguage();const skip=useContext(Skip);return skip?text:t(text);}
export function LocalizedNative({tag,originalProps}:{tag:string;originalProps:Record<string,unknown>}){
 const {t}=useLanguage();const inherited=useContext(Skip);const skip=inherited||originalProps.translate==='no';const props={...originalProps};
 if(!skip){for(const name of ['title','aria-label','placeholder','alt'])if(typeof props[name]==='string')props[name]=t(props[name] as string);
  // Pin the original option value so Spanish labels never change submitted enums or IDs.
  if(tag==='option'&&props.value===undefined&&(typeof props.children==='string'||typeof props.children==='number'))props.value=props.children;
  if(tag!=='input'&&tag!=='textarea')props.children=displayChildren(props.children as ReactNode,t);
 }
 const element=createElement(tag as ElementType,props);
 return originalProps.translate==='no'?createElement(Skip.Provider,{value:true},element):element;
}
