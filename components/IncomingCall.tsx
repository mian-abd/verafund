"use client";

import { useRef, useState } from "react";
import { Phone, PhoneOff, ShieldCheck, ShieldX } from "lucide-react";
import { heardDecision } from "@/lib/call-words";

type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type Phase = "ringing" | "speaking" | "listening" | "sending" | "done" | "declined";


// The phone's "incoming call" screen. Answering is the user gesture that lets the page
// play Vera's voice; then it listens for yes or no, with buttons as the fallback.
export function IncomingCall(props: {
  token: string;
  merchant: string;
  amountLabel: string;
  riskScore: number;
  script: string;
  settled: "yes" | "no" | null;
}) {
  const [phase, setPhase] = useState<Phase>(props.settled ? "done" : "ringing");
  const [result, setResult] = useState<{ decision: "yes" | "no"; text: string } | null>(
    props.settled ? { decision: props.settled, text: "You already answered this charge." } : null,
  );
  const [heard, setHeard] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const t = encodeURIComponent(props.token);

  const speak = (kind: "ask" | "yes" | "no", fallbackText: string) =>
    new Promise<void>((resolve) => {
      const browserVoice = () => {
        if (!("speechSynthesis" in window)) return resolve();
        const u = new SpeechSynthesisUtterance(fallbackText);
        u.onend = () => resolve();
        u.onerror = () => resolve();
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      };
      fetch(`/api/phone/audio?t=${t}&kind=${kind}`)
        .then(async (res) => {
          if (res.status !== 200) return browserVoice();
          const audio = new Audio(URL.createObjectURL(await res.blob()));
          audio.onended = () => resolve();
          await audio.play().catch(browserVoice);
        })
        .catch(browserVoice);
    });

  const answer = async (decision: "yes" | "no") => {
    recognition.current?.stop();
    setPhase("sending");
    const res = await fetch(`/api/phone/answer?t=${t}&d=${decision}`, { method: "POST" }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { ok?: boolean; text?: string } | null;
    const text = body?.text ?? "I couldn't reach VeraFund. Answer in the app instead.";
    setResult({ decision, text });
    setPhase("done");
    if (body?.ok) await speak(decision, text);
  };

  const listen = () => {
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return setPhase("listening"); // buttons only
    const r = new Ctor();
    recognition.current = r;
    r.lang = "en-US";
    r.interimResults = false;
    r.maxAlternatives = 3;
    let decided = false;
    r.onresult = (e) => {
      const alternatives = Array.from(e.results[0] ?? []).map((a) => a.transcript);
      setHeard(alternatives[0] ?? null);
      const decision = alternatives.map(heardDecision).find((d) => d !== null) ?? null;
      if (decision) {
        decided = true;
        void answer(decision);
      }
    };
    r.onend = () => {
      if (!decided) setPhase((p) => (p === "listening" ? "listening" : p));
    };
    r.onerror = () => undefined;
    setPhase("listening");
    try {
      r.start();
    } catch {
      /* buttons still work */
    }
  };

  const pickUp = async () => {
    setPhase("speaking");
    await speak("ask", props.script);
    listen();
  };

  return (
    <main
      data-testid="incoming-call"
      className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-between px-6 py-12"
    >
      <div className="text-center space-y-2 pt-6">
        <p className="text-sm uppercase tracking-widest text-white/50">
          {phase === "ringing" ? "Incoming call" : phase === "done" ? "Call ended" : "On call"}
        </p>
        <div className="relative mx-auto my-6 h-28 w-28">
          {(phase === "ringing" || phase === "speaking") && (
            <span className="absolute inset-0 rounded-full bg-orange-500/30 animate-ping" aria-hidden="true" />
          )}
          <span className="relative flex h-28 w-28 items-center justify-center rounded-full bg-orange-500 text-5xl font-bold">
            V
          </span>
        </div>
        <h1 className="text-3xl font-semibold">Vera</h1>
        <p className="text-white/60">VeraFund fraud check</p>
      </div>

      <div className="w-full max-w-sm rounded-2xl bg-white/5 border border-white/10 p-5 text-center space-y-1">
        <p className="text-4xl font-bold tabular-nums">{props.amountLabel}</p>
        <p className="text-white/80">at {props.merchant}</p>
        <p className="text-xs text-white/50">Risk score {props.riskScore}/100</p>
        {phase !== "ringing" && phase !== "done" && <p className="pt-3 text-sm text-white/80">&ldquo;{props.script}&rdquo;</p>}
        {phase === "listening" && (
          <p className="pt-2 text-sm text-orange-300" aria-live="polite">
            {heard ? `Heard: “${heard}”. Say yes or no.` : "Listening… say yes or no."}
          </p>
        )}
        {phase === "done" && result && (
          <div className="pt-3 flex flex-col items-center gap-2" aria-live="polite">
            {result.decision === "no" ? <ShieldX className="text-red-400" /> : <ShieldCheck className="text-green-400" />}
            <p className="text-sm text-white/80">{result.text}</p>
          </div>
        )}
      </div>

      <div className="w-full max-w-sm">
        {phase === "ringing" && (
          <div className="flex items-center justify-around">
            <button
              type="button"
              onClick={() => setPhase("declined")}
              aria-label="Decline"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600"
            >
              <PhoneOff />
            </button>
            <button
              type="button"
              onClick={pickUp}
              data-testid="answer-call"
              aria-label="Answer"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-green-600 animate-pulse"
            >
              <Phone />
            </button>
          </div>
        )}
        {(phase === "speaking" || phase === "listening" || phase === "declined") && (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => answer("yes")}
              data-testid="call-yes"
              className="rounded-xl bg-white/10 border border-white/20 py-3 font-semibold"
            >
              It was me
            </button>
            <button
              type="button"
              onClick={() => answer("no")}
              data-testid="call-no"
              className="rounded-xl bg-red-600 py-3 font-semibold"
            >
              Block it
            </button>
          </div>
        )}
        {phase === "sending" && <p className="text-center text-white/60">One moment…</p>}
      </div>
    </main>
  );
}
