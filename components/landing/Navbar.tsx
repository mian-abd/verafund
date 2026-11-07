"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Menu, X } from "lucide-react";
import { startDemo } from "@/app/actions";
import { SubmitButton } from "@/components/ui";

const navLinks = [
  { label: "How It Works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
  { label: "Technology", href: "#integration" },
];

function PrimaryAction({ hasDemo, className = "" }: { hasDemo: boolean; className?: string }) {
  if (hasDemo) {
    return (
      <a
        href="/app"
        className={`inline-flex items-center justify-center rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity ${className}`}
      >
        Continue
      </a>
    );
  }
  return (
    <form action={startDemo} className={className}>
      <SubmitButton pendingText="Setting up…" className="w-full px-6 py-2.5">
        Get started
      </SubmitButton>
    </form>
  );
}

const Navbar = ({ hasDemo }: { hasDemo: boolean }) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-[1200px] animate-rise"
    >
      <div className="flex items-center justify-between rounded-2xl border border-border bg-card/80 backdrop-blur-md px-6 py-4 shadow-sm">
        <a href="/" className="flex items-center gap-2">
          <img src="/images/logo-icon.svg" alt="" className="w-8 h-8 rounded-full" />
          <span className="text-lg font-bold text-foreground">
            Vera<span className="text-muted-foreground font-medium">Fund</span>
          </span>
        </a>

        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <a key={link.label} href={link.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <PrimaryAction hasDemo={hasDemo} />
        </div>

        <button
          type="button"
          className="md:hidden text-foreground"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {mobileOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 rounded-2xl border border-border bg-card/95 backdrop-blur-md p-6 shadow-lg md:hidden"
        >
          <div className="flex flex-col gap-4">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="text-base text-muted-foreground hover:text-foreground transition-colors"
              >
                {link.label}
              </a>
            ))}
            <PrimaryAction hasDemo={hasDemo} />
          </div>
        </motion.div>
      )}
    </nav>
  );
};

export default Navbar;
