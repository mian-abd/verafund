import { getWorkspaceId } from "@/lib/session";

export const dynamic = "force-dynamic";

const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // ElevenLabs premade voice "Rachel"

// Speaks one of Vera's replies. Only for an active workspace, capped length, and
// 204 when ElevenLabs isn't configured so the browser's own voice takes over.
export async function POST(request: Request) {
  const workspaceId = await getWorkspaceId();
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!workspaceId) return new Response(null, { status: 401 });
  if (!apiKey) return new Response(null, { status: 204 });

  const body = (await request.json().catch(() => ({}))) as { text?: unknown };
  const text = typeof body.text === "string" ? body.text.replace(/[*#_`]/g, "").trim().slice(0, 700) : "";
  if (!text) return new Response(null, { status: 204 });

  const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_VOICE_ID;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: "eleven_flash_v2_5" }),
    signal: AbortSignal.timeout(12_000),
  }).catch(() => null);
  if (!res?.ok || !res.body) return new Response(null, { status: 204 });
  return new Response(res.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
}
