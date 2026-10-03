import { loadSpeechSdk, type SpeechSdk } from "@/lib/speech-sdk";

const SOURCE_LANGUAGE = "de-DE";
const TARGET_LANGUAGE = "en";
const TOKEN_REFRESH_MS = 8 * 60 * 1000;

export type SpeechLine = {
  german: string;
  english: string;
};

export type TranslationHandlers = {
  onPartial: (line: SpeechLine) => void;
  onFinal: (line: SpeechLine) => void;
  onNoMatch: () => void;
  onError: (message: string) => void;
  onSessionStopped: () => void;
};

export type LiveTranslation = {
  stop: () => Promise<void>;
  ended: boolean;
};

type SpeechToken = {
  token: string;
  region: string;
};

export async function startLiveTranslation(
  handlers: TranslationHandlers,
): Promise<LiveTranslation> {
  if (!window.isSecureContext) {
    throw new Error("The microphone needs localhost or HTTPS.");
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser does not expose a microphone.");
  }

  const auth = await requestSpeechToken();
  const sdk = await loadSpeechSdk();
  const config = sdk.SpeechTranslationConfig.fromAuthorizationToken(
    auth.token,
    auth.region,
  );
  config.speechRecognitionLanguage = SOURCE_LANGUAGE;
  config.addTargetLanguage(TARGET_LANGUAGE);
  config.enableDictation();

  const audio = sdk.AudioConfig.fromDefaultMicrophoneInput();
  const recognizer = new sdk.TranslationRecognizer(config, audio);
  let stopped = false;
  let refreshTimer = 0;
  let partialFrame = 0;
  let pendingPartial: SpeechLine | null = null;

  const readLine = (
    result: InstanceType<SpeechSdk["TranslationRecognitionResult"]>,
  ): SpeechLine => ({
    german: result.text?.trim() ?? "",
    english: englishFrom(result),
  });

  const flushPartial = () => {
    if (partialFrame) {
      window.cancelAnimationFrame(partialFrame);
      partialFrame = 0;
    }
    pendingPartial = null;
  };

  const emitPartial = (line: SpeechLine) => {
    pendingPartial = line;
    if (partialFrame) return;
    partialFrame = window.requestAnimationFrame(() => {
      partialFrame = 0;
      if (stopped || !pendingPartial) return;
      handlers.onPartial(pendingPartial);
      pendingPartial = null;
    });
  };

  recognizer.recognizing = (_sender, event) => {
    if (stopped) return;
    const reason = event.result.reason;
    if (
      reason !== sdk.ResultReason.TranslatingSpeech &&
      reason !== sdk.ResultReason.RecognizingSpeech
    ) {
      return;
    }
    const line = readLine(event.result);
    if (!line.german && !line.english) return;
    emitPartial(line);
  };

  recognizer.recognized = (_sender, event) => {
    if (stopped) return;
    flushPartial();
    const reason = event.result.reason;
    if (
      reason === sdk.ResultReason.TranslatedSpeech ||
      reason === sdk.ResultReason.RecognizedSpeech
    ) {
      const line = readLine(event.result);
      if (!line.german && !line.english) {
        handlers.onNoMatch();
        return;
      }
      handlers.onFinal(line);
      return;
    }
    if (reason === sdk.ResultReason.NoMatch) {
      handlers.onNoMatch();
    }
  };

  recognizer.canceled = (_sender, event) => {
    if (stopped) return;
    if (event.reason === sdk.CancellationReason.Error) {
      handlers.onError(friendlySpeechError(event.errorDetails));
    }
    void shutdown();
  };

  try {
    await new Promise<void>((resolve, reject) => {
      recognizer.startContinuousRecognitionAsync(resolve, (error) => {
        reject(new Error(friendlySpeechError(String(error))));
      });
    });
  } catch (error) {
    stopped = true;
    flushPartial();
    recognizer.close();
    config.close();
    throw error;
  }

  refreshTimer = window.setInterval(() => {
    void requestSpeechToken()
      .then((next) => {
        if (!stopped) recognizer.authorizationToken = next.token;
      })
      .catch((error: unknown) => {
        if (stopped) return;
        handlers.onError(
          error instanceof Error
            ? error.message
            : "Could not refresh the speech token.",
        );
      });
  }, TOKEN_REFRESH_MS);

  function shutdown() {
    return new Promise<void>((resolve) => {
      if (stopped) {
        resolve();
        return;
      }
      stopped = true;
      flushPartial();
      window.clearInterval(refreshTimer);
      recognizer.stopContinuousRecognitionAsync(
        () => {
          recognizer.close();
          config.close();
          handlers.onSessionStopped();
          resolve();
        },
        () => {
          recognizer.close();
          config.close();
          handlers.onSessionStopped();
          resolve();
        },
      );
    });
  }

  return {
    stop: shutdown,
    get ended() {
      return stopped;
    },
  };
}

function englishFrom(
  result: InstanceType<SpeechSdk["TranslationRecognitionResult"]>,
): string {
  const direct = result.translations.get(TARGET_LANGUAGE, "").trim();
  if (direct) return direct;

  for (const language of result.translations.languages) {
    if (language.toLowerCase().startsWith("en")) {
      return result.translations.get(language, "").trim();
    }
  }

  return "";
}

async function requestSpeechToken(): Promise<SpeechToken> {
  let response: Response;
  try {
    response = await fetch("/api/token", { method: "POST", cache: "no-store" });
  } catch {
    throw new Error("Could not reach the local token server.");
  }

  let body: { token?: unknown; region?: unknown; error?: unknown } = {};
  try {
    body = (await response.json()) as typeof body;
  } catch {
    body = {};
  }

  if (!response.ok) {
    const message =
      typeof body.error === "string" && body.error
        ? body.error
        : "Could not get a speech token.";
    throw new Error(message);
  }

  if (
    typeof body.token !== "string" ||
    typeof body.region !== "string" ||
    !body.token ||
    !body.region
  ) {
    throw new Error("The speech token response was incomplete.");
  }

  return { token: body.token, region: body.region };
}

function friendlySpeechError(details: string): string {
  const text = details.toLowerCase();
  if (
    text.includes("notallowederror") ||
    text.includes("permission denied") ||
    text.includes("permission dismissed")
  ) {
    return "The browser blocked the microphone. Allow microphone access and try again.";
  }
  if (text.includes("notfounderror") || text.includes("requested device")) {
    return "No microphone was found.";
  }
  if (text.includes("insecure") || text.includes("secure origin")) {
    return "The microphone needs localhost or HTTPS.";
  }

  const compact = details.replace(/\s+/g, " ").trim();
  if (!compact) return "Speech translation stopped.";
  return compact.length > 240 ? `${compact.slice(0, 237)}…` : compact;
}
