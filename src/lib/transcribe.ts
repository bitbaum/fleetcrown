/**
 * SSOT for "turn an audio blob into text via Groq Whisper".
 *
 * Lifted out of app/api/beacon/transcribe/route.ts when the public feedback
 * widget needed the same step. Two callers with two copies of the error
 * mapping would drift the moment one of them learned something about a Groq
 * failure mode the other did not.
 *
 * This module owns ONLY the Groq attempt. The local-Whisper fallback stays in
 * the beacon route: it spawns ffmpeg + python3 on whatever host serves the
 * request, which is a reasonable thing to do for an authenticated operator and
 * an unreasonable thing to expose to anonymous public traffic.
 */
import { callGroqTranscribe } from "@/lib/groq";

/**
 * Tagged result rather than throw/catch, so a caller can tell a failure it
 * should retry elsewhere (bad key, rate limit, network) from one where the
 * audio itself is the problem and retrying anywhere is pointless.
 */
export type TranscribeAttempt =
  | { ok: true; text: string }
  | { ok: false; recoverable: boolean; status: number; error: string; detail?: string };

/** Below this, the blob cannot contain speech — usually a click-and-release. */
const MIN_AUDIO_BYTES = 100;

export async function transcribeWithGroq(audio: File): Promise<TranscribeAttempt> {
  const buf = Buffer.from(await audio.arrayBuffer());
  if (buf.length < MIN_AUDIO_BYTES) {
    return { ok: false, recoverable: false, status: 422, error: "Recording too short" };
  }
  try {
    const blob = new Blob([buf], { type: audio.type || "audio/webm" });
    const text = await callGroqTranscribe(blob, audio.type || "audio/webm");
    if (!text) {
      return { ok: false, recoverable: false, status: 422, error: "No speech detected" };
    }
    return { ok: true, text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/groq transcribe 401/i.test(msg) || /invalid.*api.*key/i.test(msg)) {
      return {
        ok: false,
        recoverable: true,
        status: 502,
        error:
          "Groq API key invalid — rotate it at https://console.groq.com and update GROQ_API_KEY.",
        detail: msg,
      };
    }
    if (/groq transcribe 429/i.test(msg) || /rate.?limit/i.test(msg) || /quota/i.test(msg)) {
      return {
        ok: false,
        recoverable: true,
        status: 429,
        error: "Groq rate-limited or over quota.",
        detail: msg,
      };
    }
    if (/abort|timeout/i.test(msg)) {
      return {
        ok: false,
        recoverable: true,
        status: 504,
        error: "Groq transcription timed out (>30s).",
        detail: msg,
      };
    }
    return { ok: false, recoverable: true, status: 502, error: msg };
  }
}
