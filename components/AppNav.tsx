"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, BrainCircuit, Camera, CreditCard, History, Landmark, LayoutDashboard, Target } from "lucide-react";

const GROUPS = [
  {
    label: "Money",
    items: [
      { href: "/app/overview", label: "Overview", icon: LayoutDashboard },
      { href: "/app", label: "Subscriptions", icon: CreditCard },
      { href: "/app/transactions", label: "Transactions", icon: ArrowLeftRight },
      { href: "/app/goals", label: "Goals & Debt", icon: Target },
      { href: "/app/banks", label: "Banks", icon: Landmark },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/app/analyzer", label: "Purchase Analyzer", icon: Camera },
      { href: "/app/activity", label: "Activity", icon: History },
      { href: "/app/advisor", label: "AI Advisor", icon: BrainCircuit },
    ],
  },
];

export function AppNav({ orientation }: { orientation: "vertical" | "horizontal" }) {
  const pathname = usePathname();
  const vertical = orientation === "vertical";

  const link = (item: (typeof GROUPS)[number]["items"][number]) => {
    const isActive = item.href === "/app" ? pathname === "/app" || pathname.startsWith("/app/subscriptions") : pathname === item.href;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        className={`group relative flex items-center gap-3 whitespace-nowrap rounded-xl text-sm transition-colors ${
          vertical ? "px-3 py-2" : "px-3 py-2"
        } ${
          isActive
            ? "bg-primary/10 font-semibold text-foreground"
            : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        {isActive && vertical && (
          <span aria-hidden="true" className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
        )}
        <item.icon
          size={17}
          strokeWidth={isActive ? 2.25 : 2}
          aria-hidden="true"
          className={isActive ? "text-primary" : "text-muted-foreground transition-colors group-hover:text-foreground"}
        />
        {item.label}
      </Link>
    );
  };

  if (!vertical) {
    return (
      <nav aria-label="Main" className="flex items-center gap-1 overflow-x-auto pb-0.5">
        {GROUPS.flatMap((g) => g.items).map(link)}
      </nav>
    );
  }

  return (
    <nav aria-label="Main" className="flex-1 space-y-6 overflow-y-auto px-3 pt-2">
      {GROUPS.map((group) => (
        <div key={group.label} className="space-y-1">
          <p className="eyebrow px-3 pb-1">{group.label}</p>
          {group.items.map(link)}
        </div>
      ))}
    </nav>
  );
}
