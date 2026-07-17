"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { analystPresentation, statusTone, type Tone } from "@/lib/dashboard-view";

export interface MultiSelectProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  renderOption: (option: string) => ReactNode;
}

export function multiSelectButtonLabel(label: string, options: string[], selected: string[]) {
  const allSelected = options.length === selected.length && options.every((option) => selected.includes(option));
  if (allSelected) return label;
  if (!selected.length) return `${label}: ничего`;
  const excluded = options.filter((option) => !selected.includes(option));
  if (excluded.length <= 2) return `${label}: кроме ${excluded.join(", ")}`;
  if (selected.length <= 2) return `${label}: ${selected.join(", ")}`;
  return `${label}: ${selected[0]} +${selected.length - 1}`;
}

export function MultiSelect({ label, options, selected, onChange, renderOption }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const allSelected = options.length === selected.length && options.every((option) => selected.includes(option));
  const someSelected = selected.length > 0 && !allSelected;

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  function toggle(option: string) {
    onChange(selected.includes(option) ? selected.filter((item) => item !== option) : [...selected, option]);
  }

  function toggleAll() {
    onChange(allSelected ? [] : [...options]);
  }

  const btnLabel = multiSelectButtonLabel(label, options, selected);

  return <div className="multiSelect" ref={rootRef}>
    <button
      type="button"
      className={allSelected ? "multiSelectButton" : "multiSelectButton active"}
      aria-expanded={open}
      aria-haspopup="listbox"
      onClick={() => setOpen((value) => !value)}
      title={btnLabel}
    >
      <span>{btnLabel}</span><ChevronDown open={open} />
    </button>
    {open && <div className="multiSelectDropdown" role="listbox" aria-multiselectable="true">
      <button type="button" className="multiSelectOption selectAllOption" onClick={toggleAll}>
        <Checkbox checked={allSelected} indeterminate={someSelected} />
        <span>Выбрать все</span>
      </button>
      <div className="multiSelectDivider" />
      <div className="multiSelectOptions">
        {options.map((option) => {
          const checked = selected.includes(option);
          return <button type="button" className="multiSelectOption" key={option} role="option" aria-selected={checked} onClick={() => toggle(option)}>
            <Checkbox checked={checked} />
            {renderOption(option)}
          </button>;
        })}
      </div>
      {!options.length && <div className="multiSelectEmpty">Нет доступных значений</div>}
    </div>}
  </div>;
}

export function Checkbox({ checked, indeterminate = false }: { checked: boolean; indeterminate?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <span className={`checkbox ${checked ? "checked" : ""} ${indeterminate ? "indeterminate" : ""}`} aria-hidden="true">
    <input ref={inputRef} type="checkbox" checked={checked} readOnly tabIndex={-1} />
    <span>{indeterminate ? "−" : checked ? "✓" : ""}</span>
  </span>;
}

const fallbackTones: Tone[] = ["blue", "violet", "green", "yellow", "peach", "gray"];
export function stableTone(value: string): Tone {
  let hash = 0;
  for (const character of value.trim().toLowerCase()) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return fallbackTones[Math.abs(hash) % fallbackTones.length];
}

export function ColorTag({ value, kind = "generic" }: { value: string; kind?: "generic" | "status" }) {
  const tone = kind === "status" ? statusTone(value) : stableTone(value);
  return <span className={`colorTag tone-${tone}`}><span className="tagDot" /><span>{value || "—"}</span></span>;
}

export function ResponsibleTag({ value, compact = false }: { value: string; compact?: boolean }) {
  const meta = analystPresentation(value);
  return <span className={`analystTag ${compact ? "compact" : ""} tone-${meta.tone}`}><b>{meta.icon}</b><span>{meta.label}</span></span>;
}

function ChevronDown({ open }: { open: boolean }) {
  return <svg className={open ? "multiSelectChevron open" : "multiSelectChevron"} viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4" /></svg>;
}
