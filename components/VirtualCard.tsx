"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Copy, Eye, EyeOff, Loader2 } from "lucide-react";
import { revealCardAction } from "@/app/card-actions";
import { getBrandColor } from "@/lib/brand";
import { formatCents } from "@/lib/format";

type Provider = "stripe" | "lithic" | "simulated";

type Revealed = { number: string; cvc: string; expMonth: number; expYear: number; issuer: "stripe" | "verafund" };

// How long revealed details stay on screen before hiding themselves again.
const AUTO_HIDE_MS = 90_000;

function cardLabel(provider: Provider): string {
  if (provider === "stripe") return "STRIPE VIRTUAL CARD";
  if (provider === "lithic") return "LITHIC VIRTUAL CARD";
  return "VIRTUAL CARD";
}

// White text on dark faces, near-black on light ones (Hulu green, Amazon orange).
function inkFor(color: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return "#FFFFFF";
  const n = parseInt(m[1], 16);
  const luma = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return luma > 155 ? "#14110F" : "#FFFFFF";
}

function groupsOf4(digits: string): string {
  return digits.replace(/\D/g, "").replace(/(\d{4})(?=\d)/g, "$1 ");
}

function Chip() {
  return (
    <svg width="38" height="29" viewBox="0 0 38 29" aria-hidden="true" className="drop-shadow-sm">
      <defs>
        <linearGradient id="chip-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F6E3A8" />
          <stop offset="48%" stopColor="#D9B35E" />
          <stop offset="100%" stopColor="#B88A33" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="37" height="28" rx="5.5" fill="url(#chip-gold)" stroke="rgba(0,0,0,0.25)" />
      <g stroke="rgba(90,60,10,0.55)" strokeWidth="0.9" fill="none">
        <path d="M0.5 10h11.5a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3H0.5" />
        <path d="M37.5 10H26a3 3 0 0 0-3 3v3a3 3 0 0 0 3 3h11.5" />
        <path d="M13 0.5v8M25 0.5v8M13 20.5v8M25 20.5v8" />
        <rect x="14.5" y="9" width="9" height="11" rx="2" />
      </g>
    </svg>
  );
}

function Contactless() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" className="opacity-80">
      <path d="M8.5 8.5a5 5 0 0 1 0 7" />
      <path d="M12 6a8.5 8.5 0 0 1 0 12" />
      <path d="M15.5 3.6a12 12 0 0 1 0 16.8" />
    </svg>
  );
}

export function VirtualCard({
  merchant,
  category,
  last4,
  limitCents,
  provider,
  locked,
  badge,
  subscriptionId,
}: {
  merchant: string;
  category: string;
  last4: string;
  limitCents: number;
  provider: Provider;
  locked: boolean;
  badge: string | null;
  subscriptionId?: string;
}) {
  const brand = getBrandColor(merchant);
  const ink = inkFor(brand);
  const dark = ink === "#FFFFFF";

  const [pending, startTransition] = useTransition();
  const [details, setDetails] = useState<Revealed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Sensitive details go away on their own.
  useEffect(() => {
    if (!details) return;
    const t = setTimeout(() => setDetails(null), AUTO_HIDE_MS);
    return () => clearTimeout(t);
  }, [details]);

  const reveal = () => {
    if (!subscriptionId) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await revealCardAction(subscriptionId);
        if (!alive.current) return;
        if (res.ok) {
          setDetails({ number: res.number, cvc: res.cvc, expMonth: res.expMonth, expYear: res.expYear, issuer: res.issuer });
        } else {
          setDetails(null);
          setError(res.message);
        }
      } catch {
        if (alive.current) setError("Couldn't load the card details. Try again.");
      }
    });
  };

  const hide = () => {
    setDetails(null);
    setCopied(false);
  };

  const copy = async () => {
    if (!details) return;
    try {
      await navigator.clipboard.writeText(details.number.replace(/\D/g, ""));
      setCopied(true);
      setTimeout(() => alive.current && setCopied(false), 1600);
    } catch {
      setError("Copy isn't available in this browser. Select the number instead.");
    }
  };

  const expiry = details ? `${String(details.expMonth).padStart(2, "0")}/${String(details.expYear).slice(-2)}` : null;
  const faint = dark ? "rgba(255,255,255,0.72)" : "rgba(20,17,15,0.68)";

  return (
    <div className="space-y-3" data-testid="virtual-card">
      <div
        role="group"
        aria-label={`${merchant} virtual card ending ${last4}`}
        title={category}
        className="vcard relative aspect-[1.586/1] w-full max-w-[340px] select-none overflow-hidden rounded-[18px] p-4"
        style={{
          color: ink,
          background: `linear-gradient(135deg, color-mix(in srgb, ${brand} 78%, white) 0%, ${brand} 42%, color-mix(in srgb, ${brand} 60%, black) 100%)`,
          boxShadow: `0 20px 36px -20px ${brand}, 0 3px 8px rgba(0,0,0,0.16), inset 0 0 0 1px rgba(255,255,255,0.16), inset 0 1px 0 rgba(255,255,255,0.28)`,
          filter: locked ? "saturate(0.3) brightness(0.92)" : undefined,
          opacity: locked ? 0.88 : 1,
        }}
      >
        {/* Face decoration: soft highlight, ring motif and a slow sheen */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full"
          style={{ background: "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.30), rgba(255,255,255,0) 68%)" }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -left-20 h-64 w-64 rounded-full border"
          style={{ borderColor: dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.07)", borderWidth: 22 }}
        />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="vcard-sheen absolute inset-y-0 left-0 w-1/3"
            style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.16), transparent)" }}
          />
        </div>

        <div className="relative flex h-full flex-col justify-between">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[9px] font-semibold tracking-[0.2em]" style={{ color: faint }}>
              {cardLabel(provider)}
            </p>
            {badge && (
              <span className="rounded-full bg-black/70 px-2 py-0.5 text-[9px] font-bold tracking-wider text-white">{badge}</span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <Chip />
            <Contactless />
          </div>

          <p
            className="whitespace-nowrap font-mono text-[15px] font-medium tracking-[0.13em]"
            style={{ textShadow: dark ? "0 1px 1px rgba(0,0,0,0.28)" : "0 1px 0 rgba(255,255,255,0.35)" }}
            aria-label={details ? "Card number" : `Card number ending ${last4}`}
          >
            {details ? groupsOf4(details.number) : `•••• •••• •••• ${last4}`}
          </p>

          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">{merchant}</p>
              {details ? (
                <p className="mt-0.5 flex gap-3 font-mono text-[11px] tabular-nums" style={{ color: faint }}>
                  <span>
                    <span className="mr-1 text-[8px] tracking-wider">VALID THRU</span>
                    {expiry}
                  </span>
                  <span>
                    <span className="mr-1 text-[8px] tracking-wider">CVC</span>
                    {details.cvc}
                  </span>
                </p>
              ) : (
                <p className="mt-0.5 truncate text-[11px]" style={{ color: faint }}>
                  <span className="mr-1">Per-charge limit</span>{" "}
                  <span className="font-semibold tabular-nums" style={{ color: ink }}>
                    {formatCents(limitCents)}
                  </span>
                </p>
              )}
            </div>
            <span
              className="flex-shrink-0 pr-0.5 text-[22px] font-extrabold italic leading-none tracking-tight"
              style={{ fontFamily: "var(--font-sans), Inter, sans-serif" }}
              aria-label="Visa"
            >
              VISA
            </span>
          </div>
        </div>
      </div>

      {subscriptionId && (
        <div className="max-w-[340px] space-y-2">
          {details ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={hide}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-[0_1px_2px_rgba(38,28,18,0.06)] transition-colors hover:bg-muted"
                >
                  <EyeOff size={13} aria-hidden="true" /> Hide
                </button>
                <button
                  type="button"
                  onClick={copy}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-[0_1px_2px_rgba(38,28,18,0.06)] transition-colors hover:bg-muted"
                >
                  {copied ? <Check size={13} className="text-success" aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                  {copied ? "Copied" : "Copy number"}
                </button>
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                {details.issuer === "stripe" ? "Stripe sandbox card · no real money moves" : "Sandbox card · no real money moves"}
              </p>
            </>
          ) : (
            <button
              type="button"
              onClick={reveal}
              disabled={pending}
              aria-busy={pending}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-[0_1px_2px_rgba(38,28,18,0.06)] transition-colors hover:bg-muted disabled:opacity-60"
            >
              {pending ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Eye size={13} aria-hidden="true" />}
              {pending ? "Loading…" : "Show card details"}
            </button>
          )}
          {error && (
            <p role="alert" className="text-xs leading-snug text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
