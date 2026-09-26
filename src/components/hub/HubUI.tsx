"use client";

import { X } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

export const inputClass = "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100";
export const selectClass = inputClass;

export function PageIntro({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.section
      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative overflow-hidden rounded-[24px] border border-emerald-100 bg-gradient-to-br from-white via-white to-emerald-50 shadow-sm sm:rounded-3xl"
    >
      <motion.div
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-35"
        style={{ background: "radial-gradient(circle, var(--theme-300), transparent 68%)" }}
        animate={reducedMotion ? undefined : { x: [0, -12, 0], y: [0, 10, 0], scale: [1, 1.06, 1] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="pointer-events-none absolute -bottom-20 left-1/3 h-40 w-40 rounded-full opacity-20"
        style={{ background: "radial-gradient(circle, var(--theme-accent), transparent 70%)" }}
        animate={reducedMotion ? undefined : { x: [0, 14, 0], y: [0, -8, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="relative flex flex-col gap-4 p-5 sm:gap-5 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-3xl">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-emerald-700">{eyebrow}</p>
          <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-4xl">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">{description}</p>
        </div>
        {actions && <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:gap-3 sm:overflow-visible sm:pb-0">{actions}</div>}
      </div>
    </motion.section>
  );
}

export function StatCard({ label, value, helper, icon, tone = "emerald" }: { label: string; value: string | number; helper?: string; icon?: ReactNode; tone?: "emerald" | "amber" | "red" | "blue" | "purple" | "slate" }) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    blue: "bg-blue-50 text-blue-700",
    purple: "bg-purple-50 text-purple-700",
    slate: "bg-slate-100 text-slate-700",
  };
  const reducedMotion = useReducedMotion();
  return (
    <motion.article whileHover={reducedMotion ? undefined : { y: -3 }} transition={{ duration: 0.2 }} className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm sm:rounded-2xl sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
          {helper && <p className="mt-1 text-xs leading-5 text-slate-500">{helper}</p>}
        </div>
        {icon && <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}>{icon}</div>}
      </div>
    </motion.article>
  );
}

export function SectionCard({ title, description, action, children, className = "" }: { title?: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.section initial={reducedMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className={`rounded-[22px] border border-slate-200 bg-white shadow-sm sm:rounded-2xl ${className}`}>
      {(title || description || action) && (
        <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
          <div>
            {title && <h2 className="font-black text-slate-950">{title}</h2>}
            {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </motion.section>
  );
}

export function StatusBadge({ children, tone = "slate" }: { children: ReactNode; tone?: "green" | "amber" | "red" | "blue" | "purple" | "slate" }) {
  const tones = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-red-200 bg-red-50 text-red-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    purple: "border-purple-200 bg-purple-50 text-purple-800",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${tones[tone]}`}>{children}</span>;
}

export function PrimaryButton({ children, onClick, type = "button", disabled = false }: { children: ReactNode; onClick?: () => void; type?: "button" | "submit"; disabled?: boolean }) {
  return <motion.button whileTap={{ scale: 0.97 }} type={type} onClick={onClick} disabled={disabled} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">{children}</motion.button>;
}

export function SecondaryButton({ children, onClick, type = "button", disabled = false }: { children: ReactNode; onClick?: () => void; type?: "button" | "submit"; disabled?: boolean }) {
  return <motion.button whileTap={{ scale: disabled ? 1 : 0.97 }} type={type} onClick={onClick} disabled={disabled} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">{children}</motion.button>;
}

export function Modal({ title, description, onClose, children, footer }: { title: string; description?: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={onClose}>
      <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-t-[30px] bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-3xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-5 py-4 sm:px-6 sm:py-5">
          <div><h2 className="text-xl font-black text-slate-950">{title}</h2>{description && <p className="mt-1 text-sm text-slate-500">{description}</p>}</div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5 sm:p-6">{children}</div>
        {footer && <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:gap-3 sm:px-6">{footer}</div>}
      </div>
    </div>
  );
}

export function DemoNotice() {
  return <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-950"><strong>Secure owner & licensee pilot:</strong> Changes save to the shared TCS database. Danielle controls system settings; licensees use operational tools for their assigned location. Parent access remains disabled.</div>;
}
