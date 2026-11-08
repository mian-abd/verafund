import { getBrandColor } from "@/lib/brand";
import { formatCents } from "@/lib/format";

export function VirtualCard({
  merchant,
  category,
  last4,
  limitCents,
  provider,
  locked,
  badge,
}: {
  merchant: string;
  category: string;
  last4: string;
  limitCents: number;
  provider: "stripe" | "lithic" | "simulated";
  locked: boolean;
  badge: string | null;
}) {
  return (
    <div
      className="p-5 text-white relative overflow-hidden rounded-2xl"
      style={{ background: getBrandColor(merchant), opacity: locked ? 0.6 : 1 }}
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-8 translate-x-8" />
      <div className="flex items-start justify-between mb-6 relative">
        <span className="text-sm font-semibold">{merchant}</span>
        <span className="text-[10px] uppercase tracking-wider opacity-70">{category}</span>
      </div>
      <p className="text-sm font-mono tracking-[0.12em] whitespace-nowrap mb-5 relative">•••• •••• •••• {last4}</p>
      <div className="flex items-end justify-between relative">
        <div>
          <p className="text-[10px] uppercase opacity-60 mb-0.5">Per-charge limit</p>
          <p className="text-sm font-bold">{formatCents(limitCents)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase opacity-60 mb-0.5">Network</p>
          <p className="text-sm font-bold">{provider === "stripe" ? "Stripe sandbox" : provider === "lithic" ? "Lithic sandbox" : "Simulated"}</p>
        </div>
      </div>
      {badge && (
        <div className="absolute top-3 right-3 bg-black/70 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
          {badge}
        </div>
      )}
    </div>
  );
}
