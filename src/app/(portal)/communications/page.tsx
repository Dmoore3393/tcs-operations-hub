"use client";

import MainLayout from "@/components/layout/MainLayout";
import { GatorGuide } from "@/components/brand/HubJoy";
import TeamCommunications from "@/components/communications/TeamCommunications";
import { canAccessRoute, useAuth } from "@/components/providers/AuthProvider";
import { Bell, ClipboardCheck, Mail, Pin } from "lucide-react";
import Link from "next/link";

const tools = [
  { href: "/family-communications", label: "Family messages", detail: "Private conversations with verified guardians", icon: Mail },
  { href: "/shift-reports", label: "Shift handoffs", detail: "Opening, closing and pickup follow-through", icon: ClipboardCheck },
  { href: "/notifications", label: "Alerts & devices", detail: "Your notifications and alert settings", icon: Bell },
  { href: "/employee-bulletin", label: "Bulletin board", detail: "Existing policies, reminders and recognition", icon: Pin },
];
export default function CommunicationsPage() {
  const { profile } = useAuth();
  return <MainLayout><div className="mx-auto max-w-[1500px] space-y-6 pb-10">
    <section className="flex items-start justify-between gap-4 rounded-[30px] bg-gradient-to-br from-emerald-900 to-[#163c29] p-6 text-white shadow-lg sm:p-8"><div><p className="text-sm font-black uppercase tracking-widest text-emerald-100">TCS • Stay connected</p><h1 className="mt-3 text-3xl font-black sm:text-4xl">Conversations that stay together.</h1><p className="mt-3 max-w-3xl text-lg leading-8 text-emerald-50">Ask your team, find the latest announcement and see what needs your acknowledgment.</p></div><div className="hidden sm:block"><GatorGuide size="md" /></div></section>
    <nav aria-label="Communication tools" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{tools.filter((tool) => canAccessRoute(profile, tool.href)).map(({ icon: Icon, ...tool }) => <Link key={tool.href} href={tool.href} className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm hover:bg-emerald-50"><Icon className="h-6 w-6 text-emerald-800" aria-hidden="true" /><p className="mt-3 text-lg font-black text-slate-950">{tool.label}</p><p className="mt-1 text-base leading-6 text-slate-700">{tool.detail}</p></Link>)}</nav>
    <TeamCommunications />
  </div></MainLayout>;
}
