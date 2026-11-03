"use client";

import { useId, useState } from "react";
import { inputClass } from "@/components/hub/HubUI";

export type ChoiceOption = string | { value: string; label: string };
export type ChoiceSelectProps = {
  label: string;
  value: string;
  options: readonly ChoiceOption[];
  onChange: (value: string) => void;
  allowCustom?: boolean;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
};

/** Native phone picker. Existing values stay available until the user changes them. */
export default function ChoiceSelect({ label, value, options, onChange, allowCustom = false, placeholder = "Choose…", required, disabled, className = inputClass }: ChoiceSelectProps) {
  const customKey = useId();
  const [custom, setCustom] = useState(false);
  const unique = new Map<string, string>();
  for (const option of options) {
    const item = typeof option === "string" ? { value: option, label: option } : option;
    if (item.value.trim() && !unique.has(item.value)) unique.set(item.value, item.label);
  }
  if (value && !unique.has(value)) unique.set(value, value);
  return <span className="block space-y-2">
    <select aria-label={label} className={`${className} min-h-11 w-full text-base`} style={{ minHeight: 44, fontSize: 16 }} value={custom && allowCustom ? customKey : value} required={required && !custom} disabled={disabled} onChange={event => {
      if (event.target.value === customKey) { setCustom(true); return; }
      setCustom(false);
      onChange(event.target.value);
    }}>
      <option value="">{placeholder}</option>
      {[...unique].map(([option, title]) => <option key={option} value={option}>{title}</option>)}
      {allowCustom && <option value={customKey}>Other — enter a value</option>}
    </select>
    {custom && allowCustom && <input aria-label={`${label} — custom value`} className={`${className} min-h-11 w-full text-base`} style={{ minHeight: 44, fontSize: 16 }} value={value} onChange={event => onChange(event.target.value)} required={required} disabled={disabled} placeholder="Enter your own value" />}
  </span>;
}
