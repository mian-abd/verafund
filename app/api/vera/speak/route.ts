import { getDashboard } from "@/lib/guard";
import { getWorkspaceId } from "@/lib/session";
import { pickVeraAlert } from "@/lib/vera";

export const dynamic = "force-dynamic";

const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // ElevenLabs premade voice "Rachel"

// Speaks the current Vera alert for this workspace. Returns 204 when there is no
// ElevenLabs key or no alert, and the browser falls back to its own speech engine.
export async function GET(request: Request) {
  const chargeId = new URL(request.url).searchParams.get("chargeId");
  const workspaceId = await getWorkspaceId();
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!workspaceId || !chargeId || !apiKey) return new Response(null, { status: 204 });

  const { subscriptions } = await getDashboard(workspaceId).catch(() => ({ subscriptions: [] }));
  const alert = pickVeraAlert(subscriptions);
  if (!alert || alert.chargeId !== chargeId) return new Response(null, { status: 204 });

  const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_VOICE_ID;
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text: alert.script, model_id: "eleven_flash_v2_5" }),
      signal: AbortSignal.timeout(10_000),
    },
  ).catch((err) => {
    console.error("[vera] ElevenLabs request failed", err);
    return null;
  });
  if (!res?.ok || !res.body) {
    if (res) console.error("[vera] ElevenLabs error", res.status, await res.text().catch(() => ""));
    return new Response(null, { status: 204 });
  }
  return new Response(res.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
}
