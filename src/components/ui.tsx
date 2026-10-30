"use client";

import { useEffect, useRef, useState } from "react";

export function Tile({ k, v, warn }: { k: string; v: React.ReactNode; warn?: boolean }) {
  return <div className={"tile" + (warn ? " warn" : "")}><div className="k">{k}</div><div className="v">{v}</div></div>;
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string][] }) {
  return (
    <div className="tabs" role="tablist">
      {items.map(([k, l]) => (
        <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)}>{l}</button>
      ))}
    </div>
  );
}

export function Table({ head, children, foot, empty = "Nothing here yet." }: { head: [string, ("n" | "")?][]; children: React.ReactNode[]; foot?: React.ReactNode; empty?: string }) {
  if (!children.length) return <div className="tbl"><div className="empty">{empty}</div></div>;
  return (
    <div className="tbl">
      <table>
        <thead><tr>{head.map(([h, c], i) => <th key={i} className={c || ""}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
        {foot}
      </table>
    </div>
  );
}

export function Modal({ title, onClose, children, actions }: { title: string; onClose: () => void; children: React.ReactNode; actions: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("input,select")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <h2>{title}</h2>
        {children}
        <div className="acts">{actions}</div>
      </div>
    </div>
  );
}

// A delete button that asks for a second click instead of a browser dialog.
export function ConfirmButton({ onConfirm, children, label = "Click again to confirm" }: { onConfirm: () => void; children: React.ReactNode; label?: string }) {
  const [sure, setSure] = useState(false);
  return <button type="button" className="btn danger" onClick={() => (sure ? onConfirm() : setSure(true))}>{sure ? label : children}</button>;
}

export function DateInput({ value, onChange, id = "f-date" }: { value: string; onChange: (v: string) => void; id?: string }) {
  return <input type="date" id={id} value={value} onChange={(e) => e.target.value && onChange(e.target.value)} aria-label="Day" />;
}
export function MonthInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input type="month" id="f-month" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} aria-label="Month" />;
}

export function useForm<T extends Record<string, string | boolean>>(init: T) {
  const [v, setV] = useState(init);
  const bind = (k: keyof T) => ({
    name: String(k),
    value: String(v[k]),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((o) => ({ ...o, [k]: e.target.value })),
  });
  const check = (k: keyof T) => ({
    name: String(k),
    checked: Boolean(v[k]),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setV((o) => ({ ...o, [k]: e.target.checked })),
  });
  return { v, setV, bind, check };
}
