import { Smartphone } from "lucide-react";
import { setPhoneAlertsAction } from "@/app/app/transactions/actions";
import { ReturnTo, SubmitButton } from "@/components/ui";

// Opt-in for Vera ringing the owner's phone (ntfy push with a call screen) on fraud.
export function PhoneAlerts({ on }: { on: boolean }) {
  return (
    <section data-testid="phone-alerts" className="surface space-y-3 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Smartphone size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold text-foreground">Vera calls your phone</h2>
          <p className="text-sm text-muted-foreground">
            When a charge looks like fraud or a subscription tries to raise its price, your phone rings with Vera. Answer to talk, or tap &ldquo;It was me&rdquo; or &ldquo;Approve&rdquo; and
            &ldquo;Block it&rdquo; right from the lock screen.
          </p>
        </div>
      </div>
      <form action={setPhoneAlertsAction} className="flex items-center justify-between gap-3">
        <ReturnTo />
        <input type="hidden" name="on" value={on ? "0" : "1"} />
        <span className={`text-sm font-medium ${on ? "text-success" : "text-muted-foreground"}`}>
          {on ? "On" : "Off"}
        </span>
        <SubmitButton variant={on ? "outline" : "primary"} pendingText="Saving…" data-testid="phone-alerts-toggle">
          {on ? "Turn off" : "Turn on"}
        </SubmitButton>
      </form>
    </section>
  );
}
