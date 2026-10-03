import "server-only";

const REGION_PATTERN = /^[a-z0-9]{2,40}$/;

export type SpeechTokenResult =
  | { ok: true; token: string; region: string }
  | { ok: false; status: number; error: string };

function readEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  return typeof value === "string" ? value.trim() : "";
}

export async function issueSpeechToken(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<SpeechTokenResult> {
  const key = readEnv(env, "AZURE_SPEECH_KEY");
  const region = readEnv(env, "AZURE_SPEECH_REGION").toLowerCase();

  if (!key || !region) {
    return {
      ok: false,
      status: 503,
      error:
        "Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env.local, then restart the dev server.",
    };
  }

  if (!REGION_PATTERN.test(region)) {
    return {
      ok: false,
      status: 400,
      error: "AZURE_SPEECH_REGION must be an Azure region name such as eastus.",
    };
  }

  let response: Response;
  try {
    response = await fetchImpl(
      `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "Content-Length": "0",
        },
        cache: "no-store",
      },
    );
  } catch {
    return {
      ok: false,
      status: 502,
      error: "Could not reach Azure Speech. Check the region and your network.",
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      status: 502,
      error: `Azure did not issue a speech token (${response.status}). Check the key and region.`,
    };
  }

  const token = (await response.text()).trim();
  if (!token) {
    return {
      ok: false,
      status: 502,
      error: "Azure returned an empty speech token.",
    };
  }

  return { ok: true, token, region };
}
