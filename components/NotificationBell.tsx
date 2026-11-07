"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { markNotificationsReadAction } from "@/app/actions";
import { ReturnTo, SubmitButton } from "./ui";

export interface BellItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  read: boolean;
  when: string;
}

export function NotificationBell({ items }: { items: BellItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = items.filter((n) => !n.read).length;

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative w-9 h-9 rounded-xl bg-background border border-border flex items-center justify-center text-muted-foreground hover:text-foreground"
      >
        <Bell size={16} aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-primary px-1 text-[10px] font-bold leading-[18px] text-primary-foreground">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div
          data-testid="notifications"
          className="absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card p-3 shadow-lg"
        >
          <div className="flex items-center justify-between px-1 pb-2">
            <p className="text-sm font-semibold text-foreground">Notifications</p>
            {unread > 0 && (
              <form action={markNotificationsReadAction}>
                <ReturnTo />
                <SubmitButton variant="ghost" className="px-2 py-1 text-xs" pendingText="…">
                  Mark all read
                </SubmitButton>
              </form>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-1 py-4 text-sm text-muted-foreground">Nothing yet. Vera will post here when she blocks or flags something.</p>
          ) : (
            <ul className="max-h-96 space-y-1 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id} className={`rounded-xl px-3 py-2 text-sm ${n.read ? "" : "bg-primary/5"}`}>
                  <p className="font-medium text-foreground">{n.title}</p>
                  <p className="text-muted-foreground">{n.body}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{n.when}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
