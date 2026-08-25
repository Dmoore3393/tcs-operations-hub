"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Check, FileCheck2, Mail, ScanLine, ShieldCheck, Sparkles, UserRoundCheck } from "lucide-react";
import type { ReactNode } from "react";

export function FloatingOperationsGraphic({ variant = "enrollment" }: { variant?: "enrollment" | "timesheets" }) {
  const reducedMotion = useReducedMotion();
  const items = variant === "enrollment"
    ? [
        { icon: <UserRoundCheck className="h-5 w-5" />, label: "Child" },
        { icon: <ShieldCheck className="h-5 w-5" />, label: "Location" },
        { icon: <Check className="h-5 w-5" />, label: "Enrolled" },
      ]
    : [
        { icon: <FileCheck2 className="h-5 w-5" />, label: "Prepared" },
        { icon: <ScanLine className="h-5 w-5" />, label: "Scanned" },
        { icon: <Mail className="h-5 w-5" />, label: "Emailed" },
      ];

  return (
    <div className="relative mx-auto h-44 w-full max-w-sm overflow-hidden rounded-[2rem] border border-white/50 bg-white/15 p-5 shadow-2xl backdrop-blur-sm">
      <motion.div
        className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/20 blur-sm"
        animate={reducedMotion ? undefined : { y: [0, 12, 0], x: [0, -7, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-10 -left-8 h-36 w-36 rounded-full bg-white/15 blur-sm"
        animate={reducedMotion ? undefined : { y: [0, -10, 0], x: [0, 8, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="relative flex h-full items-center justify-between gap-3">
        {items.map((item, index) => (
          <div key={item.label} className="relative flex flex-1 flex-col items-center">
            {index < items.length - 1 && (
              <div className="absolute left-[68%] top-6 h-0.5 w-[70%] overflow-hidden bg-white/25">
                <motion.div
                  className="h-full w-1/2 bg-white"
                  animate={reducedMotion ? undefined : { x: ["-100%", "230%"] }}
                  transition={{ duration: 2.2, repeat: Infinity, delay: index * 0.35, ease: "linear" }}
                />
              </div>
            )}
            <motion.div
              className="relative z-10 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[var(--theme-700)] shadow-lg"
              animate={reducedMotion ? undefined : { y: [0, -5, 0] }}
              transition={{ duration: 2.8, repeat: Infinity, delay: index * 0.3, ease: "easeInOut" }}
            >
              {item.icon}
            </motion.div>
            <p className="mt-3 text-center text-xs font-black text-white">{item.label}</p>
          </div>
        ))}
      </div>
      <motion.div
        className="absolute right-5 top-4 text-white"
        animate={reducedMotion ? undefined : { rotate: [0, 12, -8, 0], scale: [1, 1.15, 1] }}
        transition={{ duration: 3.5, repeat: Infinity }}
      >
        <Sparkles className="h-5 w-5" />
      </motion.div>
    </div>
  );
}

export function AnimatedProgressRing({ value, label, helper }: { value: number; label: string; helper?: string }) {
  const reducedMotion = useReducedMotion();
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const dash = circumference - (clamped / 100) * circumference;

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-28 w-28 shrink-0">
        <svg className="h-28 w-28 -rotate-90" viewBox="0 0 120 120" role="img" aria-label={`${label}: ${clamped}%`}>
          <circle cx="60" cy="60" r={radius} fill="none" stroke="currentColor" strokeWidth="10" className="text-slate-100" />
          <motion.circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="var(--theme-600)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={reducedMotion ? { strokeDashoffset: dash } : { strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: dash }}
            transition={{ duration: reducedMotion ? 0 : 1.1, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-2xl font-black text-slate-950">{clamped}%</div>
      </div>
      <div>
        <p className="font-black text-slate-950">{label}</p>
        {helper && <p className="mt-1 text-sm leading-6 text-slate-500">{helper}</p>}
      </div>
    </div>
  );
}

export function AnimatedStep({ active, complete, icon, title, helper, index }: { active: boolean; complete: boolean; icon: ReactNode; title: string; helper: string; index: number }) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reducedMotion ? 0 : index * 0.05 }}
      className={`relative rounded-2xl border p-4 transition ${complete ? "border-emerald-200 bg-emerald-50" : active ? "border-amber-300 bg-amber-50 shadow-md" : "border-slate-200 bg-white"}`}
    >
      {active && !reducedMotion && <span className="absolute -right-1 -top-1 h-3 w-3 animate-ping rounded-full bg-amber-500" />}
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${complete ? "bg-emerald-600 text-white" : active ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-500"}`}>{complete ? <Check className="h-5 w-5" /> : icon}</div>
        <div className="min-w-0">
          <p className="font-black text-slate-950">{title}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{helper}</p>
        </div>
      </div>
    </motion.div>
  );
}

export function SuccessBurst({ show, text }: { show: boolean; text: string }) {
  const reducedMotion = useReducedMotion();
  if (!show) return null;
  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, scale: 0.7, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="pointer-events-none fixed inset-x-0 top-24 z-[80] mx-auto flex w-fit items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-2xl"
    >
      <Sparkles className="h-4 w-4 text-amber-300" /> {text}
    </motion.div>
  );
}
