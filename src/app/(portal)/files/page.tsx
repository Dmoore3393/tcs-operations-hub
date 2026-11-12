"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import LocationFilesPanel from "@/components/files/LocationFilesPanel";
import LegacyFilesPage from "@/components/files/LegacyFilesPage";

export default function FilesPage() {
 const { isSystemOwner, isLocationLicensee } = useAuth();
 const [legacyRequest, setLegacyRequest] = useState<boolean|null>(null);
 useEffect(()=>{const timer=window.setTimeout(()=>{const params=new URLSearchParams(window.location.search);setLegacyRequest(["child","type","location"].some(key=>params.has(key)));},0);return()=>window.clearTimeout(timer);},[]);
 if(legacyRequest===null)return <MainLayout><p role="status">Loading files…</p></MainLayout>;
 if(legacyRequest)return <LegacyFilesPage />;
 if (!isSystemOwner && !isLocationLicensee) return <LegacyFilesPage />;
 return <MainLayout><div className="mx-auto max-w-[1500px] space-y-6">
  <header className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-8">
   <p className="text-sm font-bold uppercase tracking-wider text-emerald-800">Licensing and compliance</p>
   <h1 className="mt-2 text-3xl font-black">Files</h1>
   <p className="mt-2 text-base text-slate-700">Maintain each child’s and employee’s paperwork separately for each care location.</p>
   <Link href="/files/legacy" className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-4 py-2 font-bold">Earlier file items & document vault</Link>
   <p className="mt-2 text-sm text-slate-600">Existing documents and previous tracking items are retained there. They have not been copied into every location or marked complete.</p>
  </header>
  <LocationFilesPanel />
  <Link href="/files/legacy" className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 py-2 font-bold">Earlier file items & document vault</Link>
 </div></MainLayout>;
}
