import { verifyCallToken } from "@/lib/phone-alert";
import { loadCallSubject } from "@/lib/phone-call";

export const dynamic = "force-dynamic";

const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // ElevenLabs premade voice "Rachel"

// Vera's voice on the phone call. Only fixed lines about the charge in the signed link
// can be spoken, so the route can't be used as a general text-to-speech service.
// 204 when ElevenLabs isn't configured: the call screen falls back to the phone's voice.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const claim = verifyCallToken(url.searchParams.get("t") ?? "");
  if (!claim) return new Response(null, { status: 401 });
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) return new Response(null, { status: 204 });

  const subject = await loadCallSubject(claim);
  if (!subject) return new Response(null, { status: 404 });
  const kind = url.searchParams.get("kind");
  const text = kind === "yes" || kind === "no" ? subject.replies[kind] : subject.script;

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
