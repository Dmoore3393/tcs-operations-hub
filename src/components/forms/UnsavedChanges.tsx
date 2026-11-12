"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {isActiveUnsavedGuard,registerUnsavedGuard} from "@/lib/unsaved-transitions";
type Options={discard?:()=>void;save?:()=>Promise<boolean>;saveLabel?:string;busy?:boolean};
/** Explicit leave protection. Never submits or stores sensitive drafts automatically. */
export function useUnsavedChanges(dirty:boolean,options:Options={}){
 const [pending,setPending]=useState<(()=>void)|null>(null),[saving,setSaving]=useState(false),[saveError,setSaveError]=useState("");
 const key=useRef(Symbol("unsaved-editor"));
 const bypassLeave=useRef(false);
 const remove=useRef<(()=>void)|null>(null);
 const request=useCallback((action:()=>void)=>{if(options.busy||saving)return;if(dirty){setSaveError("");setPending(()=>action);}else action();},[dirty,options.busy,saving]);
 useEffect(()=>{
  bypassLeave.current=false;
  if(!dirty&&!options.busy)return;
  const guard=(action:()=>void)=>{if(!options.busy&&!saving){setSaveError("");setPending(()=>action);}};
  const unregister=registerUnsavedGuard(key.current,guard);remove.current=unregister;
  const unload=(event:BeforeUnloadEvent)=>{if(!bypassLeave.current){event.preventDefault();event.returnValue="";}};
  const navigation=(event:MouseEvent)=>{
   if(!isActiveUnsavedGuard(key.current)||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey)return;
   const target=event.target instanceof Element?event.target.closest<HTMLAnchorElement>("a[href]"):null;
   if(!target||target.target==="_blank"||target.hasAttribute("download")||target.closest('[data-unsaved-prompt="true"]'))return;
   const url=new URL(target.href,window.location.href);
   if(url.origin===window.location.origin&&url.pathname===window.location.pathname&&url.search===window.location.search)return;
   if(!["https:","http:","capacitor:"].includes(url.protocol))return;
   event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
   guard(()=>target.click());
  };
  window.addEventListener("beforeunload",unload);document.addEventListener("click",navigation,true);
  return()=>{unregister();remove.current=null;window.removeEventListener("beforeunload",unload);document.removeEventListener("click",navigation,true);};
 },[dirty,options.busy,saving]);
 function leave(){const action=pending;bypassLeave.current=true;remove.current?.();setPending(null);action?.();}
 const dialog=pending&&typeof document!=="undefined"?createPortal(<div data-unsaved-prompt="true" role="alertdialog" aria-modal="true" aria-labelledby="hub-unsaved-title" className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-950/60 p-4" onKeyDown={e=>{if(e.key==="Escape"&&!saving){e.preventDefault();setPending(null);}}}>
  <section className="w-full max-w-md rounded-2xl bg-white p-5 text-slate-950 shadow-2xl"><h2 id="hub-unsaved-title" className="text-xl font-black">You have unsaved changes</h2><p className="mt-3">Keep editing or discard your changes before leaving this form.</p>{saveError&&<p role="alert" className="mt-3 text-red-800">{saveError}</p>}
   <div className="mt-5 flex flex-wrap gap-3"><button autoFocus type="button" disabled={saving} onClick={()=>setPending(null)} className="min-h-11 rounded-xl bg-emerald-800 px-4 py-2 font-bold text-white">Keep editing</button>
    {options.save&&<button type="button" disabled={saving} onClick={async()=>{setSaving(true);setSaveError("");try{if(await options.save!())leave();else setSaveError("The changes were not saved. Keep editing to review the message in the form.");}catch{setSaveError("Could not save. Your entries are still here.");}finally{setSaving(false);}}} className="min-h-11 rounded-xl border border-emerald-800 px-4 py-2 font-bold">{saving?"Saving…":options.saveLabel||"Save and leave"}</button>}
    <button type="button" disabled={saving} onClick={()=>{options.discard?.();leave();}} className="min-h-11 rounded-xl border border-slate-300 px-4 py-2 font-bold">Discard changes</button>
   </div><p className="mt-4 text-sm text-slate-600">No report will be submitted automatically.</p>
  </section>
 </div>,document.body):null;
 return{request,dialog};
}
