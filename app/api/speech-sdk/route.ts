import { readFile } from "node:fs/promises";
import path from "node:path";
import "server-only";

const bundlePath = path.join(
  process.cwd(),
  "node_modules",
  "microsoft-cognitiveservices-speech-sdk",
  "distrib",
  "browser",
  "microsoft.cognitiveservices.speech.sdk.bundle-min.js",
);

let bundle: Buffer | null = null;

export async function GET() {
  try {
    bundle ??= await readFile(bundlePath);
    return new Response(new Uint8Array(bundle), {
      headers: {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json(
      { error: "The speech SDK is not installed. Run npm install." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
