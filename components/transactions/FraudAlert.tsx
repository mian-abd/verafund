"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, ShieldAlert, Volume2, VolumeX } from "lucide-react";
import { resolveFlaggedAction, ringPhoneAction } from "@/app/app/transactions/actions";
import { ReturnTo, SubmitButton } from "@/components/ui";

const VOICE_KEY = "vf_vera_voice";
const SPOKEN_KEY = "vf_vera_fraud_spoken";

function readFlag(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeFlag(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
};

export interface FraudAlertData {
  transactionId: string;
  script: string;
  amountLabel: string;
  merchant: string;
  riskScore: number;
  topSignals: string[];
}

// Vera reads a flagged charge out loud (ElevenLabs, or the browser's voice as a
// fallback) and lets you answer by voice or with the buttons. Voice is off until
// the user turns it on, so automated test runs never trigger audio.
export function FraudAlert({ alert, phoneReady = false }: { alert: FraudAlertData; phoneReady?: boolean }) {
  const [voiceOn, setVoiceOn] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const yesForm = useRef<HTMLFormElement>(null);
  const noForm = useRef<HTMLFormElement>(null);

  useEffect(() => setVoiceOn(readFlag(VOICE_KEY) === "on"), []);

  useEffect(() => {
    if (!voiceOn || readFlag(SPOKEN_KEY) === alert.transactionId) return;
    writeFlag(SPOKEN_KEY, alert.transactionId);
    const speakInBrowser = () => {
      if (!("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(alert.script));
    };
    fetch(`/api/vera/fraud-speak?transactionId=${encodeURIComponent(alert.transactionId)}`)
      .then(async (res) => {
        if (res.status !== 200) return speakInBrowser();
        const url = URL.createObjectURL(await res.blob());
        await new Audio(url).play().catch(speakInBrowser);
      })
      .catch(speakInBrowser);
  }, [alert, voiceOn]);

  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    writeFlag(VOICE_KEY, next ? "on" : "off");
  };

  const listen = () => {
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      setHeard("Voice answers need Chrome. Use the buttons instead.");
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 3;
    rec.onresult = (e) => {
      const said = Array.from(e.results[0]).map((r) => r.transcript.toLowerCase()).join(" | ");
      setHeard(`Heard: “${e.results[0][0].transcript}”`);
      // "No" wins ties: "no, that wasn't me" must never read as a yes.
      if (/\b(no|nope|block|wasn't|was not|not me|don't|do not|never|fraud|stop)\b/.test(said)) noForm.current?.requestSubmit();
      else if (/\b(yes|yeah|yep|me|mine|it was|sure|ok|okay)\b/.test(said)) yesForm.current?.requestSubmit();
      else setHeard(`Heard: “${e.results[0][0].transcript}”. Say “yes, it was me” or “no, block it”.`);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  };

  return (
    <div className="space-y-3 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/[0.04] to-transparent p-5 [box-shadow:var(--shadow-card)]" data-testid="vera-fraud-alert">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">V</span>
          <p className="text-sm font-semibold text-foreground">Vera</p>
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-bold text-destructive">
            <ShieldAlert size={13} aria-hidden="true" /> Risk {alert.riskScore}/100
          </span>
        </div>
        <button
          type="button"
          onClick={toggleVoice}
          aria-pressed={voiceOn}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-[0_1px_2px_rgba(38,28,18,0.06)] transition-colors hover:bg-muted"
        >
          {voiceOn ? <Volume2 size={14} aria-hidden="true" /> : <VolumeX size={14} aria-hidden="true" />}
          {voiceOn ? "Vera voice on" : "Turn on Vera voice"}
        </button>
      </div>

      <p className="text-sm text-foreground" data-testid="vera-fraud-script">
        {alert.script}
      </p>
      {alert.topSignals.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-0.5">
          {alert.topSignals.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <form ref={yesForm} action={resolveFlaggedAction}>
          <ReturnTo />
          <input type="hidden" name="transactionId" value={alert.transactionId} />
          <input type="hidden" name="decision" value="yes" />
          <SubmitButton pendingText="Saving…" data-testid="fraud-yes">
            Yes, it was me
          </SubmitButton>
        </form>
        <form ref={noForm} action={resolveFlaggedAction}>
          <ReturnTo />
          <input type="hidden" name="transactionId" value={alert.transactionId} />
          <input type="hidden" name="decision" value="no" />
          <SubmitButton variant="outline" pendingText="Blocking…" data-testid="fraud-no">
            No, block it
          </SubmitButton>
        </form>
        {phoneReady && (
          <form action={ringPhoneAction}>
            <ReturnTo />
            <input type="hidden" name="transactionId" value={alert.transactionId} />
            <SubmitButton variant="ghost" pendingText="Ringing…" data-testid="fraud-ring-phone">
              Ring my phone
            </SubmitButton>
          </form>
        )}
        <button
          type="button"
          onClick={listen}
          disabled={listening}
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
        >
          <Mic size={16} aria-hidden="true" />
          {listening ? "Listening…" : "Answer by voice"}
        </button>
      </div>
      {heard && <p className="text-xs text-muted-foreground" role="status">{heard}</p>}
    </div>
  );
}
