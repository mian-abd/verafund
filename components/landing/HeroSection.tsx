"use client";

import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { startDemo } from "@/app/actions";
import { SubmitButton } from "@/components/ui";

const HeroSection = ({ hasDemo, error, expired }: { hasDemo: boolean; error?: string; expired?: boolean }) => {
  const message = error ?? (expired ? "Your session expired. Get started again." : null);

  return (
    <section className="relative min-h-screen overflow-hidden pt-24 pb-0">
      <div className="absolute inset-0 z-0">
        <img src="/images/hero-bg.webp" alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/20 to-transparent" />
      </div>

      <div className="relative z-10 flex flex-col items-center text-center px-4 pt-12 md:pt-20">
        <div className="section-badge mb-6 animate-rise" style={{ animationDelay: "0s" }}
        >
          <ShieldCheck size={14} className="text-primary" aria-hidden="true" />
          Other apps tell you after you’re charged. VeraFund stops it first.
        </div>

        <h1 className="section-heading max-w-3xl mb-5 animate-rise" style={{ animationDelay: "0.1s" }}
        >
          Subscriptions That
          <br />
          <span className="font-serif-display italic font-normal">Ask Before They Charge</span>
        </h1>

        <p className="text-foreground/80 max-w-lg mb-8 text-base animate-rise" style={{ animationDelay: "0.2s" }}
        >
          Every subscription gets its own card with a hard price cap. Vera blocks price hikes until you approve them,
          locks free trials before they convert, flags fraud, and answers any money question by text or voice.
        </p>

        {message && (
          <div role="alert" className="mb-6 w-full max-w-md rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {message}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-4 mb-12 animate-rise" style={{ animationDelay: "0.3s" }}
        >
          <form action={startDemo}>
            <SubmitButton pendingText="Setting up your cards…" className="group pl-6 pr-2 py-2">
              {hasDemo ? "Start over" : "Get started"}
              <span className="w-9 h-9 rounded-full bg-primary-foreground/20 flex items-center justify-center group-hover:bg-primary-foreground/30 transition-colors">
                <ArrowUpRight size={16} aria-hidden="true" />
              </span>
            </SubmitButton>
          </form>
          {hasDemo ? (
            <a
              href="/app"
              className="inline-flex items-center justify-center rounded-full bg-dark px-6 py-3 text-sm font-medium text-background hover:opacity-90 transition-opacity"
            >
              Continue
            </a>
          ) : (
            <a
              href="#features"
              className="inline-flex items-center justify-center rounded-full bg-dark px-6 py-3 text-sm font-medium text-background hover:opacity-90 transition-opacity"
            >
              View Features
            </a>
          )}
        </div>

        <div className="flex items-center justify-between w-full max-w-4xl mb-4 gap-4 animate-rise" style={{ animationDelay: "0.4s" }}
        >
          <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground">
            [ Subscription Guard · Fraud Alerts · AI Advisor ]
          </span>
          <span className="hidden sm:inline text-xs font-medium tracking-widest uppercase text-muted-foreground">
            [ Sandbox cards · no real money ]
          </span>
        </div>

        <div className="w-full max-w-2xl animate-rise" style={{ animationDelay: "0.4s" }}
        >
          <img src="/images/hero-cards.png" alt="A stack of VeraFund virtual cards" className="w-full h-auto" />
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
