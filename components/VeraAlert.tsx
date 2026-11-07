"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Volume2, VolumeX } from "lucide-react";
import { approveNewPriceAction, keepAfterTrialAction, keepBlockingAction } from "@/app/actions";
import type { VeraAlert as VeraAlertData } from "@/lib/vera";
import { formatCents } from "@/lib/format";
import { ReturnTo, SubmitButton } from "./ui";

const VOICE_KEY = "vf_vera_voice";
const SPOKEN_KEY = "vf_vera_spoken";

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

// Vera reads a blocked charge out loud (ElevenLabs, or the browser's voice as a
// fallback) and lets you answer by voice or with the buttons. Voice is off until
// the user turns it on, so automated test runs never trigger audio.
export function VeraAlert({ alert }: { alert: VeraAlertData | null }) {
  const [voiceOn, setVoiceOn] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const yesForm = useRef<HTMLFormElement>(null);
  const noForm = useRef<HTMLFormElement>(null);

  useEffect(() => setVoiceOn(readFlag(VOICE_KEY) === "on"), []);

  useEffect(() => {
    if (!alert || !voiceOn || readFlag(SPOKEN_KEY) === alert.chargeId) return;
    writeFlag(SPOKEN_KEY, alert.chargeId);
    const speakInBrowser = () => {
      if (!("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(alert.script));
    };
    fetch(`/api/vera/speak?chargeId=${encodeURIComponent(alert.chargeId)}`)
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
      if (/\b(yes|yeah|yep|approve|keep it|sure|ok|okay)\b/.test(said)) yesForm.current?.requestSubmit();
      else if (/\b(no|nope|block|don't|do not|cancel|stop)\b/.test(said)) noForm.current?.requestSubmit();
      else setHeard(`Heard: “${e.results[0][0].transcript}”. Say “yes” or “no”.`);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  };

  const cycle = alert?.cycle === "yearly" ? "yr" : "mo";

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-3" data-testid="vera">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">V</span>
          <p className="text-sm font-semibold text-foreground">Vera</p>
        </div>
        <button
          type="button"
          onClick={toggleVoice}
          aria-pressed={voiceOn}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
        >
          {voiceOn ? <Volume2 size={14} aria-hidden="true" /> : <VolumeX size={14} aria-hidden="true" />}
          {voiceOn ? "Vera voice on" : "Turn on Vera voice"}
        </button>
      </div>

      {!alert ? (
        <p className="text-sm text-muted-foreground">I’m watching every card. I’ll speak up when a charge gets blocked.</p>
      ) : (
        <>
          <p className="text-sm text-foreground">{alert.script}</p>
          <div className="flex flex-wrap items-center gap-2">
            {alert.kind === "price_hike" ? (
              <>
                <form ref={yesForm} action={approveNewPriceAction}>
                  <ReturnTo />
                  <input type="hidden" name="chargeId" value={alert.chargeId} />
                  <SubmitButton pendingText="Approving…">Yes, approve {formatCents(alert.amountCents)}</SubmitButton>
                </form>
                <form ref={noForm} action={keepBlockingAction}>
                  <ReturnTo />
                  <input type="hidden" name="chargeId" value={alert.chargeId} />
                  <SubmitButton variant="outline" pendingText="Saving…">No, keep it blocked</SubmitButton>
                </form>
              </>
            ) : (
              <>
                <form ref={yesForm} action={keepAfterTrialAction}>
                  <ReturnTo />
                  <input type="hidden" name="subscriptionId" value={alert.subscriptionId} />
                  <SubmitButton pendingText="Unlocking…">
                    Yes, keep {alert.merchant} at {formatCents(alert.amountCents)}/{cycle}
                  </SubmitButton>
                </form>
                <form ref={noForm} action={async () => setHeard(`Okay, ${alert.merchant} stays blocked.`)}>
                  <SubmitButton variant="outline">No, leave it blocked</SubmitButton>
                </form>
              </>
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
          {heard && <p className="text-xs text-muted-foreground">{heard}</p>}
        </>
      )}
    </div>
  );
}
