"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, BrainCircuit, Camera, CreditCard, History, LayoutDashboard, Target } from "lucide-react";

const NAV_ITEMS = [
  { href: "/app/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/app", label: "Subscriptions", icon: CreditCard },
  { href: "/app/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/app/goals", label: "Goals & Debt", icon: Target },
  { href: "/app/advisor", label: "AI Advisor", icon: BrainCircuit },
  { href: "/app/analyzer", label: "Purchase Analyzer", icon: Camera },
  { href: "/app/activity", label: "Activity", icon: History },
];

export function AppNav({ orientation }: { orientation: "vertical" | "horizontal" }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className={orientation === "vertical" ? "flex-1 px-3 space-y-1" : "flex items-center gap-1 overflow-x-auto"}
    >
      {NAV_ITEMS.map((item) => {
        const isActive = item.href === "/app" ? pathname === "/app" || pathname.startsWith("/app/subscriptions") : pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
              isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <item.icon size={18} aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
