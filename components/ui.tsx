"use client";

import { usePathname } from "next/navigation";
import { useFormStatus } from "react-dom";

type Variant = "primary" | "dark" | "outline" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.2)] hover:brightness-110 active:brightness-95",
  dark: "bg-foreground text-background shadow-[0_1px_2px_rgba(0,0,0,0.2)] hover:opacity-90",
  outline: "border border-border bg-card text-foreground shadow-[0_1px_2px_rgba(38,28,18,0.06)] hover:bg-muted",
  ghost: "text-muted-foreground hover:text-foreground hover:bg-muted",
  danger: "border border-destructive/40 text-destructive hover:bg-destructive/10",
};

export function SubmitButton({
  children,
  pendingText = "Working…",
  variant = "primary",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingText?: string; variant?: Variant }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100 ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {pending ? pendingText : children}
    </button>
  );
}

// Lets every form send the user back to the page they submitted from.
export function ReturnTo() {
  const pathname = usePathname();
  return <input type="hidden" name="returnTo" value={pathname} />;
}
