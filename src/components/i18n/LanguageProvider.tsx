"use client";
/** @jsxImportSource react */
import {createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode} from 'react';
import {translateText,type Language} from '@/lib/i18n/translate';
type LanguageState={language:Language;setLanguage:(value:Language)=>void;t:(value:string)=>string};
const Context=createContext<LanguageState>({language:'en',setLanguage:()=>{},t:value=>value});
export function LanguageProvider({children,initialLanguage='en'}:{children:ReactNode;initialLanguage?:Language}){
 const [language,setCurrent]=useState<Language>(initialLanguage);
 const setLanguage=useCallback((value:Language)=>{setCurrent(value);document.documentElement.lang=value;document.cookie=`tcs_language=${value}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;},[]);
 useEffect(()=>{const requested=new URL(window.location.href).searchParams.get('lang');if(requested==='en'||requested==='es')queueMicrotask(()=>setLanguage(requested));},[setLanguage]);
 const value=useMemo(()=>({language,setLanguage,t:(value:string)=>translateText(value,language)}),[language,setLanguage]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useLanguage(){return useContext(Context);}
export function LanguageSwitch(){const {language,setLanguage}=useLanguage();return <label className="flex min-h-11 items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-base font-bold text-emerald-950"><span>English / Español</span><select aria-label="English / Español" value={language} onChange={event=>setLanguage(event.target.value as Language)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-2 text-base"><option value="en">English</option><option value="es">Español</option></select></label>;}
