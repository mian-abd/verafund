"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Mic, Phone, PhoneOff, SendHorizontal, X } from "lucide-react";

type Msg = { id: string; role: "user" | "assistant"; content: string };
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

// "Ask Vera" on every page: a chat drawer that knows which page you're on, plus a
// hands-free "Call Vera" mode (speech in, Claude, ElevenLabs voice out).
export function VeraDock() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [call, setCall] = useState<CallState>("idle");
  const callRef = useRef<CallState>("idle");
  const recRef = useRef<Recognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Read through a function so TypeScript doesn't narrow the ref across awaits.
  const callEnded = () => callRef.current === "idle";

  const setCallState = (s: CallState) => {
    callRef.current = s;
    setCall(s);
  };

  useEffect(() => {
    if (!open) return;
    fetch("/api/vera/chat")
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d: { messages: Msg[] }) => setMessages(d.messages ?? []))
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, busy]);

  const ask = useCallback(
    async (question: string, voice = false): Promise<string | null> => {
      const q = question.trim();
      if (!q) return null;
      setError(null);
      setBusy(true);
      setMessages((m) => [...m, { id: `local-${Date.now()}`, role: "user", content: q }]);
      try {
        const res = await fetch("/api/vera/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: q, page: pathname, voice }),
        });
        const data = (await res.json()) as { text?: string; error?: string };
        if (!res.ok || !data.text) throw new Error(data.error ?? "Vera could not answer just now.");
        setMessages((m) => [...m, { id: `local-${Date.now()}-a`, role: "assistant", content: data.text! }]);
        return data.text;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Vera could not answer just now.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [pathname],
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
        await speak("Okay, talk soon.");
        setCallState("idle");
        return;
      }
      setCallState("thinking");
      const reply = await ask(heard, true);
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
  }, [ask, speak]);

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
                <p className="text-xs text-muted-foreground">Knows your accounts and what you’re looking at</p>
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
              <p className="text-muted-foreground">Ask anything about your money. Vera answers from your real balances, budgets, goals and subscriptions.</p>
            )}
            {messages.slice(-30).map((m) => (
              <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex"}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                    m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                  }`}
                >
                  <Text content={m.content} />
                </div>
              </div>
            ))}
            {busy && <p className="text-xs text-muted-foreground">Vera is thinking…</p>}
          </div>

          {error && (
            <p role="alert" className="mx-4 mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2 px-4 pb-2">
            {chips.map((c) => (
              <button
                key={c}
                type="button"
                disabled={busy}
                onClick={() => ask(c)}
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
              void ask(q);
            }}
          >
            <label htmlFor="vera-dock-input" className="sr-only">
              Ask Vera a question
            </label>
            <input
              id="vera-dock-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={500}
              placeholder="Ask about this page or your money…"
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
