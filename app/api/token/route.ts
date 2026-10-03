import { issueSpeechToken } from "@/lib/speech-token";

const noStore = { "Cache-Control": "no-store" };

export async function POST() {
  const result = await issueSpeechToken();

  if (!result.ok) {
    return Response.json(
      { error: result.error },
      { status: result.status, headers: noStore },
    );
  }

  return Response.json(
    { token: result.token, region: result.region },
    { headers: noStore },
  );
}
