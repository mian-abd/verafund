"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, Copy, Mic, Phone, PhoneOff, SendHorizontal, X } from "lucide-react";
import type { AgentOverview, AgentReply, WireMemory } from "@/lib/agent/types";

type CardState = "pending" | "working" | "executed" | "failed" | "cancelled" | "expired";
type Card = { actionId: string; summary: string; state: CardState; result?: string; draft?: string };
type Msg = { id: string; role: "user" | "assistant"; content: string; card?: Card };
type CallState = "idle" | "listening" | "thinking" | "speaking";

const OFFLINE_LABEL = "Rule-based answer (AI offline)";

const CHIPS: Record<string, string[]> = {
  "/app": ["Which subscriptions should I cancel?", "Did any subscription try to raise its price?"],
  "/app/overview": ["How am I doing this month?", "What bills are coming up?"],
  "/app/transactions": ["Is anything suspicious in my transactions?", "Where did most of my money go?"],
  "/app/goals": ["How fast can I pay off my credit card?", "When will I finish my emergency fund?"],
  "/app/banks": ["What do my linked accounts add up to?", "Where am I overspending?"],
  "/app/analyzer": ["Can I afford a $300 trip this month?", "What should I buy less of?"],
};

type Recognition = {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start: () => void;
  abort: () => void;
};

function recognitionCtor(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function Text({ content }: { content: string }) {
  const offline = content.startsWith(OFFLINE_LABEL);
  const body = (offline ? content.slice(OFFLINE_LABEL.length) : content).replace(/\*\*/g, "").trim();
  return (
    <>
      {offline && <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{OFFLINE_LABEL}</span>}
      <span className="whitespace-pre-line">{body}</span>
    </>
  );
}

const RESULT_LABEL: Record<CardState, string> = {
  pending: "",
  working: "Working on it…",
  executed: "Done",
  failed: "Didn't go through",
  cancelled: "Cancelled",
  expired: "Timed out",
};

// What Vera proposes to do, with the read-back she'd say out loud. Nothing runs until Yes.
function ActionCard({ card, onAnswer }: { card: Card; onAnswer: (id: string, decision: "yes" | "no") => void }) {
  const waiting = card.state === "pending" || card.state === "working";
  const [copied, setCopied] = useState(false);
  return (
    <div
      role="group"
      aria-label="Confirm Vera's action"
      data-testid="agent-confirm-card"
      data-state={card.state}
      className="w-full max-w-[94%] rounded-2xl border border-primary/30 bg-card p-3 shadow-sm"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">{waiting ? "Needs your OK" : RESULT_LABEL[card.state]}</p>
      <p className="mt-1 text-[15px] leading-snug text-foreground">{card.summary}</p>
      {waiting ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            data-testid="agent-confirm-yes"
            disabled={card.state === "working"}
            onClick={() => onAnswer(card.actionId, "yes")}
            className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            <Check size={15} aria-hidden="true" /> {card.state === "working" ? "Working…" : "Yes, do it"}
          </button>
          <button
            type="button"
            data-testid="agent-confirm-no"
            disabled={card.state === "working"}
            onClick={() => onAnswer(card.actionId, "no")}
            className="inline-flex h-10 items-center justify-center rounded-full border border-border px-5 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60"
          >
            No
          </button>
        </div>
      ) : (
        <div className="mt-2 border-t border-border pt-2" data-testid="agent-result">
          <p className={`text-sm ${card.state === "executed" ? "text-foreground" : "text-muted-foreground"}`}>{card.result}</p>
          {card.draft && (
            <details className="mt-2 rounded-lg bg-muted/60 px-3 py-2 text-xs">
              <summary className="cursor-pointer font-medium text-foreground">Cancellation message to send</summary>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-foreground">{card.draft}</pre>
              <button
                type="button"
                onClick={() => {
                  try {
                    void navigator.clipboard.writeText(card.draft!).then(() => setCopied(true));
                  } catch {
                    // clipboard blocked: the text is still selectable
                  }
                }}
                className="mt-2 inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium hover:bg-background"
              >
                <Copy size={12} aria-hidden="true" /> {copied ? "Copied" : "Copy"}
              </button>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// "Ask Vera" on every page: a chat drawer that knows which page you're on, plus a
// hands-free "Call Vera" mode (speech in, Claude, ElevenLabs voice out). Vera can also take
// actions: she reads back what she'll do and waits for a Yes (a tap, or a spoken yes on a call).
export function VeraDock() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [call, setCall] = useState<CallState>("idle");
  const [memories, setMemories] = useState<WireMemory[]>([]);
  const [hints, setHints] = useState<string[]>([]);
  const callRef = useRef<CallState>("idle");
  const recRef = useRef<Recognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // The action Vera is waiting on a spoken yes/no for, and how many times we couldn't tell.
  const pendingRef = useRef<string | null>(null);
  const unclearRef = useRef(0);

  // Read through a function so TypeScript doesn't narrow the ref across awaits.
  const callEnded = () => callRef.current === "idle";

  const setCallState = (s: CallState) => {
    callRef.current = s;
    setCall(s);
  };

  const loadOverview = useCallback(async (): Promise<AgentOverview | null> => {
    try {
      const res = await fetch("/api/vera/agent", { cache: "no-store" });
      if (!res.ok) return null;
      const data = (await res.json()) as AgentOverview;
      setMemories(data.memories ?? []);
      setHints(data.hints ?? []);
      return data;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const history = await fetch("/api/vera/chat")
        .then((r) => (r.ok ? r.json() : { messages: [] }))
        .then((d: { messages: Msg[] }) => d.messages ?? [])
        .catch(() => [] as Msg[]);
      const overview = await loadOverview();
      if (cancelled) return;
      const pending = overview?.pending ?? null;
      let base: Msg[] = history.map((m) => ({ id: m.id, role: m.role, content: m.content }));
      pendingRef.current = pending?.actionId ?? null;
      if (pending) {
        // The read-back is already the last saved assistant message; the card replaces it.
        const last = base[base.length - 1];
        if (last && last.role === "assistant" && last.content.startsWith(pending.summary)) base = base.slice(0, -1);
        base = [
          ...base,
          { id: `card-${pending.actionId}`, role: "assistant", content: "", card: { actionId: pending.actionId, summary: pending.summary, state: "pending" } },
        ];
      }
      setMessages(base);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, loadOverview]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, busy]);

  const post = useCallback(async (body: Record<string, unknown>): Promise<AgentReply> => {
    const res = await fetch("/api/vera/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as AgentReply & { error?: string };
    if (!res.ok || !data.kind) throw new Error(data.error ?? "Vera could not do that just now.");
    return data;
  }, []);

  // Shows a reply in the panel and returns the sentence Vera should say out loud.
  const applyReply = useCallback(
    (reply: AgentReply): string => {
      const stamp = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const updateCard = (id: string, patch: Partial<Card>, fallback: string) =>
        setMessages((ms) =>
          ms.some((m) => m.card?.actionId === id)
            ? ms.map((m) => (m.card?.actionId === id ? { ...m, card: { ...m.card!, ...patch } } : m))
            : [...ms, { id: stamp, role: "assistant", content: fallback }],
        );

      switch (reply.kind) {
        case "confirm":
          pendingRef.current = reply.actionId;
          unclearRef.current = 0;
          setMessages((ms) => [
            // An older request that was waiting has been withdrawn by the server.
            ...ms.map((m) => (m.card?.state === "pending" ? { ...m, card: { ...m.card, state: "cancelled" as const, result: "Replaced by your newer request." } } : m)),
            { id: stamp, role: "assistant", content: "", card: { actionId: reply.actionId, summary: reply.summary, state: "pending" } },
          ]);
          return `${reply.summary} Say yes or no.`;
        case "done":
          if (reply.actionId && pendingRef.current === reply.actionId) pendingRef.current = null;
          if (reply.actionId) updateCard(reply.actionId, { state: reply.ok ? "executed" : "failed", result: reply.text, draft: reply.draft }, reply.text);
          else setMessages((ms) => [...ms, { id: stamp, role: "assistant", content: reply.text }]);
          if (reply.refresh) router.refresh();
          void loadOverview();
          return reply.text;
        case "cancelled":
          if (reply.actionId && pendingRef.current === reply.actionId) pendingRef.current = null;
          if (reply.actionId) updateCard(reply.actionId, { state: reply.status, result: reply.text }, reply.text);
          else setMessages((ms) => [...ms, { id: stamp, role: "assistant", content: reply.text }]);
          return reply.text;
        default:
          setMessages((ms) => [...ms, { id: stamp, role: "assistant", content: reply.text }]);
          return reply.text;
      }
    },
    [router, loadOverview],
  );

  const send = useCallback(
    async (message: string, voice = false): Promise<string | null> => {
      const q = message.trim();
      if (!q) return null;
      setError(null);
      setBusy(true);
      setMessages((m) => [...m, { id: `local-${Date.now()}`, role: "user", content: q }]);
      try {
        return applyReply(await post({ message: q, page: pathname, voice }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Vera could not answer just now.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [pathname, post, applyReply],
  );

  // A tap on Yes / No.
  const answerCard = useCallback(
    async (actionId: string, decision: "yes" | "no"): Promise<string | null> => {
      setError(null);
      setMessages((ms) => ms.map((m) => (m.card?.actionId === actionId ? { ...m, card: { ...m.card, state: "working" as const } } : m)));
      try {
        return applyReply(await post({ confirm: actionId, decision }));
      } catch (err) {
        setMessages((ms) => ms.map((m) => (m.card?.actionId === actionId ? { ...m, card: { ...m.card, state: "pending" as const } } : m)));
        setError(err instanceof Error ? err.message : "Vera could not do that just now.");
        return null;
      }
    },
    [post, applyReply],
  );

  // A spoken answer to a read-back, when a call is waiting on a yes.
  const voiceConfirm = useCallback(
    async (heard: string): Promise<string | null> => {
      const actionId = pendingRef.current;
      if (!actionId) return send(heard, true);
      setError(null);
      setMessages((m) => [...m, { id: `local-${Date.now()}`, role: "user", content: heard }]);
      try {
        const reply = await post({ transcript: heard, pendingActionId: actionId, page: pathname });
        if (reply.kind === "clarify" && reply.actionId) {
          unclearRef.current += 1;
          if (unclearRef.current >= 2) {
            // Never leave a half-confirmed request open: two misses means no.
            const stopped = await post({ confirm: actionId, decision: "no" });
            applyReply(stopped);
            return "Okay, I'll leave that for now. Nothing was changed.";
          }
          setMessages((ms) => [...ms, { id: `local-${Date.now()}-c`, role: "assistant", content: reply.text }]);
          return reply.text;
        }
        return applyReply(reply);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Vera could not do that just now.");
        return null;
      }
    },
    [send, post, pathname, applyReply],
  );

  const forgetMemory = useCallback(
    async (id: string) => {
      setMemories((ms) => ms.filter((m) => m.id !== id));
      try {
        await post({ forgetMemory: id });
      } catch {
        // the list below reloads from the server either way
      }
      void loadOverview();
    },
    [post, loadOverview],
  );

  const speak = useCallback(async (text: string) => {
    const plain = text.replace(OFFLINE_LABEL, "").replace(/\*\*/g, "");
    const viaBrowser = () =>
      new Promise<void>((resolve) => {
        if (!("speechSynthesis" in window)) return resolve();
        const u = new SpeechSynthesisUtterance(plain);
        u.onend = () => resolve();
        u.onerror = () => resolve();
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      });
    try {
      const res = await fetch("/api/vera/say", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: plain }),
      });
      if (res.status !== 200) return viaBrowser();
      const url = URL.createObjectURL(await res.blob());
      await new Promise<void>((resolve) => {
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
        audio.play().catch(() => viaBrowser().then(resolve));
      });
    } catch {
      await viaBrowser();
    }
  }, []);

  const listenOnce = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || callEnded()) return;
    const rec = new Ctor();
    recRef.current = rec;
    rec.lang = "en-US";
    rec.interimResults = false;
    let heard = "";
    rec.onresult = (e) => {
      heard = e.results[0][0].transcript;
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed") {
        setError("Microphone access was blocked. Allow it in the address bar to call Vera.");
        setCallState("idle");
      }
    };
    rec.onend = async () => {
      if (callEnded()) return;
      if (!heard.trim()) return listenOnce(); // silence: keep the line open
      if (/\b(bye|goodbye|hang up|end (the )?call|that's all)\b/i.test(heard)) {
        setCallState("speaking");
        // Hanging up on a read-back means no: nothing is left half-confirmed.
        if (pendingRef.current) await post({ confirm: pendingRef.current, decision: "no" }).then(applyReply).catch(() => {});
        await speak("Okay, talk soon.");
        setCallState("idle");
        return;
      }
      setCallState("thinking");
      const reply = pendingRef.current ? await voiceConfirm(heard) : await send(heard, true);
      if (callEnded()) return;
      if (reply) {
        setCallState("speaking");
        await speak(reply);
      }
      if (!callEnded()) {
        setCallState("listening");
        listenOnce();
      }
    };
    setCallState("listening");
    rec.start();
  }, [send, voiceConfirm, speak, post, applyReply]);

  const startCall = async () => {
    if (!recognitionCtor()) {
      setError("Calling Vera needs a browser with speech recognition, like Chrome. You can still type.");
      return;
    }
    setOpen(true);
    setError(null);
    setCallState("speaking");
    await speak("Hi, it's Vera. What can I help you with?");
    if (!callEnded()) listenOnce();
  };

  const endCall = () => {
    setCallState("idle");
    recRef.current?.abort();
    audioRef.current?.pause();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  };

  useEffect(() => endCall, []);

  if (pathname === "/app/advisor") return null;

  const chips = CHIPS[pathname] ?? ["Where am I overspending?", "Can I afford a $300 trip this month?"];
  const inCall = call !== "idle";
  const callLabel = { idle: "", listening: "Listening… just talk", thinking: "Thinking…", speaking: "Vera is speaking…" }[call];

  return (
    <>
      {!open && (
        <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2">
          <button
            type="button"
            onClick={startCall}
            aria-label="Call Vera"
            className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-primary shadow-lg hover:bg-muted"
          >
            <Phone size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            className="flex items-center gap-2 rounded-full bg-primary py-2 pl-2 pr-4 text-sm font-semibold text-primary-foreground shadow-lg hover:opacity-90"
          >
            <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-foreground/20 font-bold">
              V
            </span>
            Ask Vera
          </button>
        </div>
      )}

      {open && (
        <aside
          role="dialog"
          aria-label="Ask Vera"
          data-testid="vera-dock"
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-2xl border border-border bg-card shadow-2xl sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-4 sm:max-h-none sm:w-[400px] sm:rounded-2xl"
        >
          <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                V
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">Vera</p>
                <p className="text-xs text-muted-foreground">Answers questions and does things for you</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {inCall ? (
                <button
                  type="button"
                  onClick={endCall}
                  className="inline-flex items-center gap-1.5 rounded-full bg-destructive px-3 py-1.5 text-xs font-semibold text-white"
                >
                  <PhoneOff size={14} aria-hidden="true" /> End call
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startCall}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                >
                  <Phone size={14} aria-hidden="true" /> Call Vera
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  endCall();
                  setOpen(false);
                }}
                aria-label="Close Vera"
                className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          </header>

          {inCall && (
            <div className="flex items-center gap-2 border-b border-border bg-primary/5 px-4 py-2 text-sm text-foreground" role="status">
              <Mic size={14} aria-hidden="true" className={call === "listening" ? "animate-pulse text-primary" : "text-muted-foreground"} />
              {callLabel} <span className="text-xs text-muted-foreground">Say “bye” to hang up.</span>
            </div>
          )}

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm" aria-live="polite">
            {messages.length === 0 && !busy && (
              <p className="text-muted-foreground">
                Ask anything about your money, or tell me what to do, like “cancel Netflix”. I’ll read back what I’m about to do and wait for your yes.
              </p>
            )}
            {messages.slice(-30).map((m) =>
              m.card ? (
                <div key={m.id} className="flex">
                  <ActionCard card={m.card} onAnswer={(id, d) => void answerCard(id, d)} />
                </div>
              ) : (
                <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex"}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                      m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                    }`}
                  >
                    <Text content={m.content} />
                  </div>
                </div>
              ),
            )}
            {busy && <p className="text-xs text-muted-foreground">Vera is thinking…</p>}
          </div>

          {error && (
            <p role="alert" className="mx-4 mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}

          <details className="mx-4 mb-2 rounded-lg border border-border px-3 py-1.5 text-xs" data-testid="vera-memories">
            <summary className="cursor-pointer font-medium text-foreground">What Vera remembers ({memories.length})</summary>
            {memories.length === 0 ? (
              <p className="mt-1.5 text-muted-foreground">Nothing yet. Say “remember that…” and I’ll keep it.</p>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {memories.map((m) => (
                  <li key={m.id} className="flex items-start justify-between gap-2">
                    <span className="text-foreground">{m.fact}</span>
                    <button
                      type="button"
                      onClick={() => void forgetMemory(m.id)}
                      aria-label={`Forget: ${m.fact}`}
                      data-testid="agent-forget"
                      className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      Forget
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </details>

          {hints.length > 0 && (
            <div className="px-4 pb-1" data-testid="vera-hints">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Try saying</p>
              <div className="flex flex-wrap gap-2">
                {hints.slice(0, 5).map((h) => (
                  <button
                    key={h}
                    type="button"
                    disabled={busy}
                    onClick={() => void send(h)}
                    className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs text-foreground hover:bg-primary/10 disabled:opacity-50"
                  >
                    “{h}”
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 px-4 pb-2 pt-2">
            {chips.map((c) => (
              <button
                key={c}
                type="button"
                disabled={busy}
                onClick={() => void send(c)}
                className="rounded-full border border-border px-3 py-1 text-xs text-foreground hover:bg-muted disabled:opacity-50"
              >
                {c}
              </button>
            ))}
          </div>

          <form
            className="flex items-center gap-2 border-t border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              const q = draft;
              setDraft("");
              void send(q);
            }}
          >
            <label htmlFor="vera-dock-input" className="sr-only">
              Ask Vera a question or tell her what to do
            </label>
            <input
              id="vera-dock-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={500}
              placeholder="Ask, or say “cancel Netflix”…"
              className="flex-1 rounded-full border border-input bg-background px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              aria-label="Send to Vera"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
            >
              <SendHorizontal size={16} aria-hidden="true" />
            </button>
          </form>
        </aside>
      )}
    </>
  );
}
