"use client";

import { useEffect, useId, useRef, useState } from "react";
import { analystPresentation, type Tone } from "@/lib/dashboard-view";

export function Checkbox({ checked }: { checked: boolean }) {
  return <span className={checked ? "checkbox checked" : "checkbox"} aria-hidden="true">{checked && <CheckIcon />}</span>;
}

export function ColorTag({ tone, children, className = "" }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return <span className={`colorTag tone-${tone} ${className}`.trim()}>{children}</span>;
}

export function ResponsibleTag({ value, compact = false }: { value: string; compact?: boolean }) {
  const meta = analystPresentation(value);
  return <ColorTag tone={meta.tone} className={`responsibleTag${compact ? " compact" : ""}`}><b>{meta.icon}</b>{meta.label}</ColorTag>;
}

export function MultiSelect({ label, options, selected, onChange, disabled = false }: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const toggle = (option: string) => {
    onChange(selected.includes(option) ? selected.filter((item) => item !== option) : [...selected, option]);
  };

  return <div className={open ? "multiSelect open" : "multiSelect"} ref={rootRef}>
    <span className="multiSelectLabel">{label}</span>
    <button type="button" className="multiSelectTrigger" onClick={() => setOpen((current) => !current)} disabled={disabled} aria-expanded={open} aria-controls={listId}>
      <span className="selectionSummary">
        {!selected.length && <span className="selectionPlaceholder">Все</span>}
        {selected.slice(0, 2).map((item) => <span className="selectionChip" key={item}>{item}</span>)}
        {selected.length > 2 && <span className="selectionMore">+{selected.length - 2}</span>}
      </span>
      <ChevronIcon />
    </button>
    {open && <div className="multiSelectMenu" id={listId} role="listbox" aria-multiselectable="true">
      <div className="multiSelectActions">
        <button type="button" onClick={() => onChange(options)} disabled={selected.length === options.length}>Выбрать все</button>
        <button type="button" onClick={() => onChange([])} disabled={!selected.length}>Сбросить</button>
      </div>
      <div className="multiSelectOptions">
        {options.map((option) => {
          const checked = selected.includes(option);
          return <button type="button" className="multiSelectOption" role="option" aria-selected={checked} key={option} onClick={() => toggle(option)}><Checkbox checked={checked} /><span>{option}</span></button>;
        })}
      </div>
    </div>}
  </div>;
}

function CheckIcon() { return <svg viewBox="0 0 16 16"><path d="m3.5 8 2.8 2.8 6.2-6.2" /></svg>; }
function ChevronIcon() { return <svg className="multiSelectChevron" viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4" /></svg>; }
