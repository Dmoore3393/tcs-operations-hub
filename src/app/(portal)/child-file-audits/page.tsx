"use client";
import Link from "next/link";
import MainLayout from "@/components/layout/MainLayout";
import {useAuth} from "@/components/providers/AuthProvider";
import LocationFilesPanel from "@/components/files/LocationFilesPanel";

export default function ChildFileAuditsPage(){
 const {isSystemOwner,isLocationLicensee}=useAuth();
 return <MainLayout><div className="mx-auto max-w-[1500px] space-y-5">
  <header className="rounded-3xl border border-emerald-200 bg-white p-5 sm:p-7"><h1 className="text-3xl font-black">Child File Audits</h1><p className="mt-3 text-base text-slate-700">Audit the file kept at the location you select, even when the child’s main enrollment is elsewhere. Use the same location file from either Child File Audits or Files.</p><Link href="/child-file-audits/history" className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-4 py-2 font-bold">View earlier child-level audit history</Link></header>
  {isSystemOwner||isLocationLicensee?<LocationFilesPanel childAudits />:<p className="rounded-2xl border border-amber-300 bg-amber-50 p-5">Child file audits are restricted to Owners/Admins and Licensees with location access.</p>}
 </div></MainLayout>;
}
