"use client";

import { canAccessRoute, useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { Bot, ClipboardCheck, HeartPulse, Home, Plus, ShieldCheck, Utensils, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const quickItems = [
  { href: "/daily-care", label: "Care Log", icon: ClipboardCheck },
  { href: "/meals", label: "Meal", icon: Utensils },
  { href: "/shift-reports", label: "Reports", icon: ClipboardCheck },
  { href: "/health-safety", label: "Safety", icon: HeartPulse },
  { href: "/ratios", label: "Ratios", icon: ShieldCheck },
  { href: "/ai-director", label: "TCS AI", icon: Bot },
];

export default function MobileQuickActions() {
  const { profile } = useAuth();
  const { location, theme } = useHubLocation();
  const [open, setOpen] = useState(false);
  const visible = quickItems.filter((item) => canAccessRoute(profile, item.href));
  const canOpenChildren = canAccessRoute(profile, "/children");
  const primary = visible.slice(0, 3);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[70] bg-slate-950/45 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-x-3 bottom-24 rounded-3xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Quick actions</p><h2 className="mt-1 text-xl font-black text-slate-950">{location}</h2><p className="mt-1 text-sm text-slate-500">Choose a fast employee workflow.</p></div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-slate-200 p-2 text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {visible.map((item) => {
                const Icon = item.icon;
                return <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="flex min-h-24 flex-col justify-between rounded-2xl border border-slate-200 p-4 font-black text-slate-900 shadow-sm transition active:scale-[.98]"><Icon className="h-6 w-6" style={{ color: theme.primary }} /><span>{item.label}</span></Link>;
              })}
              {canOpenChildren && <Link href="/children" onClick={() => setOpen(false)} className="flex min-h-24 flex-col justify-between rounded-2xl border border-slate-200 p-4 font-black text-slate-900 shadow-sm transition active:scale-[.98]"><Home className="h-6 w-6" style={{ color: theme.primary }} /><span>Children</span></Link>}
            </div>
          </div>
        </div>
      )}

      <div className="fixed inset-x-3 bottom-3 z-[65] rounded-3xl border border-slate-200 bg-white/95 px-3 py-2 shadow-2xl backdrop-blur lg:hidden">
        <div className="grid grid-cols-5 items-center">
          <Link href="/" className="flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-black text-slate-600"><Home className="h-5 w-5" />Home</Link>
          {primary.slice(0, 1).map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} className="flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-black text-slate-600"><Icon className="h-5 w-5" />{item.label}</Link>; })}
          <button type="button" onClick={() => setOpen((current) => !current)} className="mx-auto flex h-14 w-14 -translate-y-4 items-center justify-center rounded-full text-white shadow-xl transition active:scale-95" style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})` }} aria-label="Open quick actions"><Plus className={`h-7 w-7 transition ${open ? "rotate-45" : ""}`} /></button>
          {primary.slice(1, 2).map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} className="flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-black text-slate-600"><Icon className="h-5 w-5" />{item.label}</Link>; })}
          {primary.slice(2, 3).map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} className="flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-black text-slate-600"><Icon className="h-5 w-5" />{item.label}</Link>; })}
        </div>
      </div>
    </>
  );
}
