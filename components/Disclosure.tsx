"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

// A real <button aria-expanded> instead of <details>/<summary>, which some
// browser agents don't expose as a clickable control.
export function Disclosure({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-border bg-card">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="disclosure-panel"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-5 py-3 text-left text-sm font-semibold text-foreground"
      >
        {open ? <X size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
        {label}
      </button>
      <div id="disclosure-panel" hidden={!open} className="border-t border-border">
        {children}
      </div>
    </div>
  );
}
