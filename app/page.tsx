import Link from "next/link";
import { ArrowUpRight, CreditCard, Lock, ShieldCheck } from "lucide-react";
import { startDemo } from "./actions";
import { SubmitButton } from "@/components/ui";
import { ErrorBanner } from "@/components/guard";
import { getWorkspace } from "@/lib/guard";
import { getWorkspaceId } from "@/lib/session";

const STEPS = [
  {
    icon: CreditCard,
    title: "One card per subscription",
    body: "Each subscription gets its own virtual card with a hard per-charge limit set to the price you agreed to.",
  },
  {
    icon: ShieldCheck,
    title: "Price hikes wait for you",
    body: "A charge above the limit is declined by the card network. You see the evidence and decide: approve the new price or keep blocking.",
  },
  {
    icon: Lock,
    title: "Trials can't quietly convert",
    body: "A free-trial card locks the day the trial ends, so the first paid charge is declined unless you choose to keep it.",
  },
];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; expired?: string }>;
}) {
  const { error, expired } = await searchParams;
  const workspaceId = await getWorkspaceId();
  const hasDemo = workspaceId ? Boolean(await getWorkspace(workspaceId).catch(() => null)) : false;

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-[1200px]">
        <div className="flex items-center justify-between rounded-2xl border border-border bg-card/80 backdrop-blur-md px-4 sm:px-6 py-3 shadow-sm">
          <Link href="/" className="flex items-center gap-2">
            <img src="/images/logo-icon.svg" alt="" className="w-8 h-8 rounded-full" />
            <span className="text-lg font-bold text-foreground">
              Vera<span className="text-muted-foreground font-medium">Fund</span>
            </span>
          </Link>
          {hasDemo ? (
            <Link
              href="/app"
              className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Continue
            </Link>
          ) : (
            <form action={startDemo}>
              <SubmitButton pendingText="Starting…" className="px-5 py-2.5">
                Get started
              </SubmitButton>
            </form>
          )}
        </div>
      </nav>

      <main className="flex-1">
        <section className="relative overflow-hidden pt-28 pb-16">
          <div className="absolute inset-0 z-0">
            <img src="/images/hero-bg.webp" alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/55 to-background" />
          </div>

          <div className="relative z-10 flex flex-col items-center text-center px-4 pt-8 md:pt-16">
            <div className="section-badge mb-6">
              <ShieldCheck size={14} className="text-primary" aria-hidden="true" />
              Other apps tell you after you’re charged. VeraFund blocks it first.
            </div>

            <h1 className="section-heading max-w-3xl mb-5">
              Subscriptions that
              <br />
              <span className="font-serif-display italic font-normal">ask before they charge</span>
            </h1>

            <p className="text-foreground/80 max-w-xl mb-8 text-base">
              Every subscription gets its own virtual card with a hard price cap. Price hikes are declined until you
              approve them, and free trials can’t quietly turn into paid plans.
            </p>

            <div className="w-full max-w-md space-y-3 mb-10">
              {expired && !error && <ErrorBanner message="Your session expired. Get started again." />}
              <ErrorBanner message={error} />
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 mb-12">
              <form action={startDemo}>
                <SubmitButton pendingText="Setting up your cards…" className="pl-6 pr-2 py-2">
                  {hasDemo ? "Start over" : "Get started"}
                  <span className="w-9 h-9 rounded-full bg-primary-foreground/20 flex items-center justify-center">
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </span>
                </SubmitButton>
              </form>
              {hasDemo && (
                <Link
                  href="/app"
                  className="inline-flex items-center justify-center rounded-full bg-dark px-6 py-3 text-sm font-medium text-background hover:opacity-90"
                >
                  Continue
                </Link>
              )}
            </div>

            <p className="text-xs font-medium tracking-widest uppercase text-muted-foreground mb-6">
              [ Sandbox cards · no real money moves ]
            </p>

            <div className="w-full max-w-2xl">
              <img src="/images/hero-cards.png" alt="A stack of virtual cards" className="w-full h-auto" />
            </div>
          </div>
        </section>

        <section id="how-it-works" className="px-4 py-16 bg-background">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-center mb-10">How it works</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {STEPS.map((step) => (
                <div key={step.title} className="rounded-2xl border border-border bg-card p-6">
                  <step.icon size={22} className="text-primary mb-4" aria-hidden="true" />
                  <h3 className="font-semibold text-foreground mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground">{step.body}</p>
                </div>
              ))}
            </div>
            <p className="mt-8 text-center text-xs text-muted-foreground max-w-2xl mx-auto">
              Blocking a card stops charges on that card. It doesn’t cancel your contract with the merchant. VeraFund
              keeps a record of what you approved, what the merchant attempted, and what the card network decided.
            </p>
          </div>
        </section>
      </main>

      <footer className="py-8 px-4 bg-background border-t border-border">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/images/logo-icon.svg" alt="" className="w-7 h-7 rounded-full" />
            <span className="text-sm font-bold text-foreground">
              Vera<span className="text-muted-foreground font-medium">Fund</span>
            </span>
          </div>
          <p className="text-xs text-muted-foreground">© 2026 VeraFund</p>
        </div>
      </footer>
    </div>
  );
}
