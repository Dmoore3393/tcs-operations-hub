"use client";
/** @jsxImportSource react */
import {useEffect,useState} from 'react';
import {useAuth} from '@/components/providers/AuthProvider';
import {hubRequest} from '@/lib/hub-request';
import {useLanguage} from './LanguageProvider';
import type {Language} from '@/lib/i18n/translate';
export function StaffLanguageSync(){const {profile}=useAuth();const {setLanguage}=useLanguage();const preference=profile?.preferred_language;
 useEffect(()=>{if(preference==='en'||preference==='es')queueMicrotask(()=>setLanguage(preference));},[profile?.user_id,preference,setLanguage]);return null;
}
export function StaffLanguageSwitch(){const {session,refreshProfile}=useAuth();const {language,setLanguage}=useLanguage();const [error,setError]=useState(''),[saving,setSaving]=useState(false);
 async function choose(value:Language){setLanguage(value);setError('');if(!session?.access_token)return;setSaving(true);try{await hubRequest('/api/staff-language',session.access_token,{method:'POST',body:JSON.stringify({language:value})});await refreshProfile();}catch{setError(value==='es'?'No se pudo guardar el idioma en tu cuenta. Se conservará en este dispositivo.':'Could not save the language to your account. It is kept on this device.');}finally{setSaving(false);}}
 return <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-base text-slate-950"><label className="block font-bold">English / Español<select aria-label="English / Español" disabled={saving} value={language} onChange={event=>void choose(event.target.value as Language)} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-base"><option value="en">English</option><option value="es">Español</option></select></label>{error&&<p role="alert" className="mt-2 text-red-900">{error}</p>}</div>;
}
