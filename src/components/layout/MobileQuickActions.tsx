"use client";

import { canAccessRoute, useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import {
  Bell,
  Bot,
  Bus,
  ClipboardCheck,
  HeartPulse,
  Home,
  Menu,
  ShieldCheck,
  Users,
  Utensils,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const moreItems = [
  { href: "/employee-lounge", label: "Lounge", icon: Users },
  { href: "/children", label: "Children", icon: Home },
  { href: "/daily-care", label: "Care Log", icon: ClipboardCheck },
  { href: "/meals", label: "Meals", icon: Utensils },
  { href: "/shift-reports", label: "Reports", icon: ClipboardCheck },
  { href: "/health-safety", label: "Safety", icon: HeartPulse },
  { href: "/ratios", label: "Ratios", icon: ShieldCheck },
  { href: "/ai-director", label: "TCS AI", icon: Bot },
];

export default function MobileQuickActions() {
  const { profile } = useAuth();
  const { location, theme } = useHubLocation();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const visibleMore = moreItems.filter((item) => canAccessRoute(profile, item.href));
  const canTransportation = canAccessRoute(profile, "/transportation-v2");
  const canEmergency = canAccessRoute(profile, "/emergency-cards");

  const navItems = [
    { href: "/", label: "Home", icon: Home, visible: true },
    { href: "/transportation-v2", label: "Transport", icon: Bus, visible: canTransportation },
    { href: "/emergency-cards", label: "Emergency", icon: HeartPulse, visible: canEmergency },
    { href: "/notifications", label: "Alerts", icon: Bell, visible: true },
  ].filter((item) => item.visible);

  function active(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[80] bg-slate-950/45 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-x-3 bottom-[92px] rounded-[28px] border border-slate-200 bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">More tools</p>
                <h2 className="mt-1 text-xl font-black text-slate-950">{location}</h2>
                <p className="mt-1 text-sm text-slate-500">Only tools approved for your account are shown.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-slate-200 p-2 text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {visibleMore.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="flex min-h-24 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 font-black text-slate-900 shadow-sm transition active:scale-[.98]">
                    <Icon className="h-6 w-6" style={{ color: theme.primary }} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-[75] border-t border-slate-200 bg-white/95 pb-[max(.4rem,env(safe-area-inset-bottom))] pt-1 shadow-[0_-8px_28px_rgba(15,23,42,.12)] backdrop-blur lg:hidden" aria-label="App navigation">
        <div className="mx-auto grid max-w-lg grid-cols-5 px-2">
          {navItems.slice(0, 4).map((item) => {
            const Icon = item.icon;
            const selected = active(item.href);
            return (
              <Link key={item.href} href={item.href} className={`flex min-h-[62px] flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-black transition ${selected ? "text-slate-950" : "text-slate-500"}`}>
                <span className={`grid h-8 w-8 place-items-center rounded-xl ${selected ? "text-white" : ""}`} style={selected ? { background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})` } : undefined}><Icon className="h-4.5 w-4.5" /></span>
                {item.label}
              </Link>
            );
          })}
          <button type="button" onClick={() => setOpen((current) => !current)} className={`flex min-h-[62px] flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-black transition ${open ? "text-slate-950" : "text-slate-500"}`}>
            <span className={`grid h-8 w-8 place-items-center rounded-xl ${open ? "text-white" : ""}`} style={open ? { background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})` } : undefined}><Menu className="h-4.5 w-4.5" /></span>
            More
          </button>
        </div>
      </nav>
    </>
  );
}
