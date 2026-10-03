import type * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";

declare global {
  interface Window {
    SpeechSDK?: typeof SpeechSDK;
  }
}

export type SpeechSdk = typeof SpeechSDK;

let loading: Promise<SpeechSdk> | null = null;

export function loadSpeechSdk(): Promise<SpeechSdk> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Speech translation runs in the browser."));
  }

  if (window.SpeechSDK) {
    return Promise.resolve(window.SpeechSDK);
  }

  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/api/speech-sdk";
      script.async = true;
      script.onload = () => {
        if (window.SpeechSDK) {
          resolve(window.SpeechSDK);
          return;
        }
        loading = null;
        reject(new Error("The speech SDK did not load."));
      };
      script.onerror = () => {
        loading = null;
        reject(new Error("Could not load the speech SDK."));
      };
      document.head.appendChild(script);
    });
  }

  return loading;
}
