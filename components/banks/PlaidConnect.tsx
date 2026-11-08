"use client";

import { useState, useTransition } from "react";
import { Landmark } from "lucide-react";
import { connectBankAction, linkTokenAction } from "@/app/app/banks/actions";

type PlaidHandler = { open: () => void; destroy: () => void };
type PlaidGlobal = {
  create: (config: {
    token: string;
    onSuccess: (publicToken: string, metadata: { institution?: { name?: string } | null }) => void;
    onExit: (err: { display_message?: string; error_message?: string } | null) => void;
  }) => PlaidHandler;
};

const SCRIPT = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";

function loadPlaid(): Promise<PlaidGlobal> {
  const w = window as unknown as { Plaid?: PlaidGlobal };
  if (w.Plaid) return Promise.resolve(w.Plaid);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => (w.Plaid ? resolve(w.Plaid) : reject(new Error("Plaid Link failed to load")));
    s.onerror = () => reject(new Error("Plaid Link failed to load"));
    document.head.appendChild(s);
  });
}

// Opens Plaid Link in a modal. In the sandbox, sign in with user_good / pass_good.
export function PlaidConnect() {
  const [status, setStatus] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [pending, startTransition] = useTransition();

  const open = async () => {
    setOpening(true);
    setStatus(null);
    try {
      const res = await linkTokenAction();
      if ("error" in res) throw new Error(res.error);
      const Plaid = await loadPlaid();
      const handler = Plaid.create({
        token: res.token,
        onSuccess: (publicToken, metadata) => {
          setStatus("Importing your accounts and transactions…");
          startTransition(() => connectBankAction(publicToken, metadata.institution?.name ?? "Bank"));
        },
        onExit: (err) => {
          setOpening(false);
          if (err) setStatus(err.display_message || err.error_message || "Bank connection was cancelled.");
        },
      });
      handler.open();
    } catch (err) {
      setOpening(false);
      setStatus(err instanceof Error ? err.message : "Couldn't open Plaid.");
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={open}
        disabled={opening || pending}
        className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.2)] transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
      >
        <Landmark size={16} aria-hidden="true" />
        {pending ? "Importing…" : opening ? "Opening Plaid…" : "Connect a bank with Plaid"}
      </button>
      {status && <p className="text-sm text-muted-foreground" role="status">{status}</p>}
    </div>
  );
}
