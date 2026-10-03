"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  startLiveTranslation,
  type LiveTranslation,
  type SpeechLine,
} from "@/lib/live-translation";

type Status = "idle" | "connecting" | "listening" | "stopping";

type Line = SpeechLine & {
  id: number;
  state: "draft" | "final";
};

const statusLabel: Record<Status, string> = {
  idle: "Ready",
  connecting: "Getting a speech token…",
  listening: "Listening",
  stopping: "Stopping…",
};

export function Translator() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [latestFinal, setLatestFinal] = useState("");
  const sessionRef = useRef<LiveTranslation | null>(null);
  const runRef = useRef(0);
  const nextId = useRef(1);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    if (distance < 180) node.scrollTop = node.scrollHeight;
  }, [lines]);

  useEffect(() => {
    return () => {
      runRef.current += 1;
      void sessionRef.current?.stop();
    };
  }, []);

  async function start() {
    const generation = ++runRef.current;
    setError(null);
    setStatus("connecting");

    try {
      const session = await startLiveTranslation({
        onPartial: (line) => {
          if (runRef.current !== generation) return;
          setLines((current) => upsertDraft(current, line, nextId));
        },
        onFinal: (line) => {
          if (runRef.current !== generation) return;
          setLines((current) => settleDraft(current, line, nextId));
          setLatestFinal(`German: ${line.german}. English: ${line.english}.`);
        },
        onNoMatch: () => {
          if (runRef.current !== generation) return;
          setLines((current) => current.filter((item) => item.state !== "draft"));
        },
        onError: (message) => {
          if (runRef.current !== generation) return;
          setError(message);
        },
        onSessionStopped: () => {
          if (runRef.current !== generation) return;
          sessionRef.current = null;
          setLines((current) => current.filter((item) => item.state !== "draft"));
          setStatus("idle");
        },
      });

      if (runRef.current !== generation || session.ended) {
        await session.stop();
        if (runRef.current === generation) setStatus("idle");
        return;
      }

      sessionRef.current = session;
      setStatus("listening");
    } catch (caught) {
      if (runRef.current !== generation) return;
      setError(
        caught instanceof Error ? caught.message : "Could not start translation.",
      );
      setStatus("idle");
    }
  }

  async function stop() {
    const generation = ++runRef.current;
    const session = sessionRef.current;
    sessionRef.current = null;
    setStatus("stopping");
    setLines((current) => current.filter((item) => item.state !== "draft"));
    if (session) await session.stop();
    if (runRef.current !== generation) return;
    setStatus("idle");
  }

  function clear() {
    setLines((current) => current.filter((item) => item.state === "draft"));
    setLatestFinal("");
  }

  const listening = status === "listening";
  const buttonLabel =
    status === "listening"
      ? "Stop microphone"
      : status === "connecting"
        ? "Cancel"
        : status === "stopping"
          ? "Stopping…"
          : "Start microphone";

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <div className="h-1 shrink-0 bg-live" />
      <header className="shrink-0 border-b border-border px-4 py-4 sm:px-8 sm:py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <p className="text-[0.68rem] font-medium tracking-[0.18em] text-muted-foreground uppercase">
              Live speech translation
            </p>
            <h1 className="mt-1 font-serif text-3xl tracking-tight sm:text-4xl">
              German to English
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Speak German. The transcript and the translation update while you
              talk, then settle when the phrase ends.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Button
              type="button"
              size="lg"
              variant={listening ? "outline" : "default"}
              className="h-11 px-4"
              disabled={status === "stopping"}
              aria-pressed={listening}
              onClick={() => {
                if (status === "listening" || status === "connecting") {
                  void stop();
                  return;
                }
                void start();
              }}
            >
              {listening || status === "stopping" ? <Square /> : <Mic />}
              {buttonLabel}
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="h-11 px-4"
              disabled={lines.every((line) => line.state === "draft")}
              onClick={clear}
            >
              Clear
            </Button>
            <p
              role="status"
              className="flex min-h-6 items-center gap-2 text-sm text-muted-foreground"
            >
              {listening ? <span className="live-dot" aria-hidden /> : null}
              {statusLabel[status]}
            </p>
          </div>
        </div>
      </header>

      {error ? (
        <div
          role="alert"
          className="shrink-0 border-b border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive sm:px-8"
        >
          {error}
        </div>
      ) : null}

      <div className="sr-only" aria-live="polite">
        {latestFinal}
      </div>

      <div ref={scrollerRef} className="relative min-h-0 flex-1 overflow-y-auto">
        <div
          className="pointer-events-none absolute inset-0 grid grid-cols-2"
          aria-hidden
        >
          <div />
          <div className="border-l border-border bg-english" />
        </div>

        <div className="sticky top-0 z-10 grid grid-cols-2 border-b border-border bg-background/95 backdrop-blur-sm">
          <h2 className="px-4 py-3 text-[0.68rem] font-medium tracking-[0.16em] text-muted-foreground uppercase sm:px-8">
            German
          </h2>
          <h2 className="border-l border-border bg-english/95 px-4 py-3 text-[0.68rem] font-medium tracking-[0.16em] text-muted-foreground uppercase sm:px-8">
            English
          </h2>
        </div>

        {lines.length === 0 ? (
          <div className="relative grid grid-cols-2">
            {status === "listening" || status === "connecting" ? (
              <>
                <p className="px-4 py-8 text-sm leading-6 text-muted-foreground sm:px-8">
                  {status === "listening"
                    ? "Listening for German…"
                    : "Connecting to Azure Speech…"}
                </p>
                <p className="px-4 py-8 text-sm leading-6 text-muted-foreground sm:px-8">
                  English will appear here as you speak.
                </p>
              </>
            ) : (
              <>
                <p className="px-4 py-8 sm:px-8" lang="de">
                  <span className="block font-serif text-xl leading-snug text-foreground/75 sm:text-2xl">
                    „Guten Morgen, wie geht es Ihnen?“
                  </span>
                  <span className="mt-3 block text-sm leading-6 text-muted-foreground">
                    German appears here while you speak.
                  </span>
                </p>
                <p className="px-4 py-8 sm:px-8" lang="en">
                  <span className="block font-serif text-xl leading-snug text-foreground/75 sm:text-2xl">
                    “Good morning, how are you?”
                  </span>
                  <span className="mt-3 block text-sm leading-6 text-muted-foreground">
                    English appears here at the same time.
                  </span>
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="relative">
            {lines.map((line) => (
              <article
                key={line.id}
                data-state={line.state}
                className={
                  line.state === "draft"
                    ? "phrase-draft grid grid-cols-2 border-b border-border/70"
                    : "phrase-final grid grid-cols-2 border-b border-border/70"
                }
              >
                <p className="px-4 py-5 sm:px-8" lang="de">
                  {line.state === "draft" ? (
                    <span className="mb-1 block font-sans text-[0.68rem] font-medium tracking-[0.14em] text-live uppercase not-italic">
                      Draft
                    </span>
                  ) : null}
                  <span className="font-serif text-xl leading-snug sm:text-2xl">
                    {line.german || "…"}
                    {line.state === "draft" ? (
                      <span className="caret" aria-hidden />
                    ) : null}
                  </span>
                </p>
                <p className="px-4 py-5 sm:px-8" lang="en">
                  {line.state === "draft" ? (
                    <span className="mb-1 block font-sans text-[0.68rem] font-medium tracking-[0.14em] text-live uppercase not-italic">
                      Draft
                    </span>
                  ) : null}
                  <span className="font-serif text-xl leading-snug sm:text-2xl">
                    {line.english || "…"}
                  </span>
                </p>
              </article>
            ))}
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t border-border px-4 py-3 text-xs leading-5 text-muted-foreground sm:px-8">
        The browser asks for the microphone when you start. Allow it. Microphone
        access works on localhost or HTTPS.
      </footer>
    </div>
  );
}

function upsertDraft(
  current: Line[],
  line: SpeechLine,
  nextId: RefObject<number>,
): Line[] {
  const index = current.findIndex((item) => item.state === "draft");
  if (index === -1) {
    const id = nextId.current++;
    return [...current, { id, ...line, state: "draft" }];
  }
  const next = current.slice();
  const existing = next[index];
  if (!existing) return current;
  next[index] = { ...existing, german: line.german, english: line.english };
  return next;
}

function settleDraft(
  current: Line[],
  line: SpeechLine,
  nextId: RefObject<number>,
): Line[] {
  if (!line.german && !line.english) {
    return current.filter((item) => item.state !== "draft");
  }
  const index = current.findIndex((item) => item.state === "draft");
  if (index === -1) {
    const id = nextId.current++;
    return [...current, { id, ...line, state: "final" }];
  }
  const next = current.slice();
  const existing = next[index];
  if (!existing) return current;
  next[index] = {
    ...existing,
    german: line.german,
    english: line.english,
    state: "final",
  };
  return next;
}
