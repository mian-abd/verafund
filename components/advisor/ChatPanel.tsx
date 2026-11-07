"use client";

import { Fragment, useEffect, useOptimistic, useRef, useState } from "react";
import { SendHorizontal, Trash2 } from "lucide-react";
import { askVeraAction, clearChatAction } from "@/app/app/advisor/actions";
import { SubmitButton } from "@/components/ui";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  time: string;
}

const OFFLINE_LABEL = "Rule-based answer (AI offline)";

const CHIPS = [
  "Can I afford a $300 trip this month?",
  "Where am I overspending?",
  "How fast can I pay off my credit card?",
  "Which subscriptions should I cancel?",
];

function VeraAvatar() {
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
    >
      V
    </span>
  );
}

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") && p.length > 4 ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>,
      )}
    </>
  );
}

function Body({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        const bullet = trimmed.match(/^[-*•]\s+(.*)$/);
        if (bullet) {
          return (
            <p key={i} className="flex gap-2 pl-1">
              <span aria-hidden="true" className="text-muted-foreground">•</span>
              <span>
                <Inline text={bullet[1]} />
              </span>
            </p>
          );
        }
        return (
          <p key={i}>
            <Inline text={trimmed} />
          </p>
        );
      })}
    </div>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end" data-testid="user-message">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
          {message.time && <p className="mt-1 text-[11px] opacity-75">{message.time}</p>}
        </div>
      </div>
    );
  }
  const offline = message.content.startsWith(OFFLINE_LABEL);
  const text = offline ? message.content.slice(OFFLINE_LABEL.length).trim() : message.content;
  return (
    <div className="flex items-start gap-2.5" data-testid="assistant-message">
      <VeraAvatar />
      <div className="max-w-[88%] rounded-2xl rounded-tl-md border border-border bg-background px-4 py-2.5 text-sm text-foreground">
        {offline && (
          <p
            data-testid="rule-based-badge"
            className="mb-2 inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-300"
          >
            {OFFLINE_LABEL}
          </p>
        )}
        <Body text={text} />
        {message.time && <p className="mt-1.5 text-[11px] text-muted-foreground">{message.time}</p>}
      </div>
    </div>
  );
}

function Typing() {
  return (
    <div className="flex items-start gap-2.5" data-testid="typing-indicator" role="status" aria-label="Vera is typing">
      <VeraAvatar />
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-md border border-border bg-background px-4 py-3.5">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
        <span className="sr-only">Vera is typing</span>
      </div>
    </div>
  );
}

export function ChatPanel({ messages, aiOnline }: { messages: ChatMessage[]; aiOnline: boolean }) {
  const [view, addOptimistic] = useOptimistic(messages, (state, text: string) => [
    ...state,
    { id: `pending-${state.length}`, role: "user" as const, content: text, time: "" },
  ]);
  const thinking = view.length > messages.length;
  const [confirmClear, setConfirmClear] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length === 0) setConfirmClear(false);
  }, [messages.length]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [view.length, thinking]);

  async function send(formData: FormData) {
    const text = String(formData.get("message") ?? "").trim();
    if (!text || thinking) return;
    addOptimistic(text);
    setConfirmClear(false);
    await askVeraAction(formData);
  }

  return (
    <section
      data-testid="advisor-chat"
      aria-label="Chat with Vera"
      className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <VeraAvatar />
          <div>
            <p className="text-sm font-semibold text-foreground">Vera</p>
            <p className="text-xs text-muted-foreground">Answers from your accounts, budgets, goals and subscriptions</p>
          </div>
        </div>
        <span
          data-testid="advisor-mode"
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
            aiOnline
              ? "border-green-600/30 bg-green-600/10 text-green-700 dark:text-green-400"
              : "border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-300"
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${aiOnline ? "bg-green-600" : "bg-amber-500"}`} aria-hidden="true" />
          {aiOnline ? "Claude connected" : "AI offline · rule-based answers"}
        </span>
      </div>

      <div
        ref={scroller}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        data-testid="advisor-messages"
        className="min-h-[300px] max-h-[55vh] space-y-4 overflow-y-auto px-4 py-4"
      >
        {view.length === 0 ? (
          <div className="flex items-start gap-2.5" data-testid="advisor-empty">
            <VeraAvatar />
            <div className="rounded-2xl rounded-tl-md border border-border bg-background px-4 py-3 text-sm text-foreground">
              <p>Hi, I am Vera. Ask me anything about your money and I will answer with your real numbers.</p>
              <p className="mt-1 text-muted-foreground">Try one of the questions below.</p>
            </div>
          </div>
        ) : (
          view.map((m) => <Bubble key={m.id} message={m} />)
        )}
        {thinking && <Typing />}
      </div>

      <div className="space-y-3 border-t border-border px-4 py-3">
        <div className="flex flex-wrap gap-2" data-testid="advisor-chips" aria-label="Suggested questions" role="group">
          {CHIPS.map((chip) => (
            <form key={chip} action={send}>
              <input type="hidden" name="message" value={chip} />
              <button
                type="submit"
                disabled={thinking}
                data-testid="advisor-chip"
                className="rounded-full border border-border bg-background px-3 py-1.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
              >
                {chip}
              </button>
            </form>
          ))}
        </div>

        <form action={send} className="flex items-end gap-2">
          <div className="flex-1">
            <label htmlFor="advisor-message" className="sr-only">
              Ask Vera a question
            </label>
            <textarea
              id="advisor-message"
              name="message"
              rows={1}
              maxLength={500}
              required
              readOnly={thinking}
              data-testid="advisor-input"
              placeholder="Ask about a purchase, your budget, debt or subscriptions…"
              className="block max-h-32 w-full resize-none rounded-2xl border border-input bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
          </div>
          <button
            type="submit"
            aria-label="Send message"
            disabled={thinking}
            data-testid="advisor-send"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <SendHorizontal size={16} aria-hidden="true" />
            <span className="hidden sm:inline">Send</span>
            <span className="sr-only sm:hidden">Send</span>
          </button>
        </form>

        <div className="flex min-h-8 items-center justify-end">
          {confirmClear ? (
            <form action={clearChatAction} className="flex flex-wrap items-center justify-end gap-2" data-testid="clear-confirm">
              <span className="text-xs text-muted-foreground">Delete the whole conversation?</span>
              <SubmitButton variant="danger" pendingText="Clearing…" className="!px-3 !py-1.5 text-xs" data-testid="clear-confirm-yes">
                Yes, clear it
              </SubmitButton>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              disabled={messages.length === 0 || thinking}
              data-testid="clear-chat"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <Trash2 size={14} aria-hidden="true" />
              Clear chat
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
