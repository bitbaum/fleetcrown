import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { tmpdir } from "os";
import { join } from "path";
import { existsSync } from "fs";
import { randomUUID } from "crypto";
import { isRuntimeAvailable } from "@/lib/runtime";
import { callGroqTranscribe } from "@/lib/groq";
import { getApiUserId } from "@/lib/session";
import { getBeaconSettings } from "@/db/queries/beacon-settings";
import { enqueuePendingCommand } from "@/db/queries/pending-commands";

const execFileAsync = promisify(execFile);

// Resolve scripts/transcribe.py for both deployment modes:
//   • `npm run dev`           → cwd = repo root            → scripts/transcribe.py
//   • <app>-app.service       → cwd = .next/standalone     → ../../scripts/transcribe.py
// APP_SCRIPTS_DIR (or legacy COCKPIT_SCRIPTS_DIR) can override (e.g. when the standalone bundle is moved).
function resolveTranscribePy(): string {
  const envDir = process.env.APP_SCRIPTS_DIR ?? process.env.COCKPIT_SCRIPTS_DIR;
  const candidates = [
    envDir && join(envDir, "transcribe.py"),
    join(process.cwd(), "scripts/transcribe.py"),
    join(process.cwd(), "..", "..", "scripts/transcribe.py"),
  ].filter((p): p is string => Boolean(p));
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[candidates.length - 1];  // fail loudly at exec time with the last guess
}
const TRANSCRIBE_PY = resolveTranscribePy();

async function readTranscriptionSettings(): Promise<{ whisperModel: string; provider: string }> {
  try {
    const userId = await getApiUserId();
    if (userId) {
      const s = await getBeaconSettings(userId);
      return { whisperModel: s.whisper_model, provider: s.transcription_provider };
    }
  } catch { /* no auth — use defaults */ }
  return { whisperModel: "base", provider: "auto" };
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const audio = form.get("audio") as File | null;
  if (!audio) return NextResponse.json({ error: "No audio" }, { status: 400 });

  const [{ whisperModel: model, provider }, webmPath] = await Promise.all([
    readTranscriptionSettings(),
    Promise.resolve(join(tmpdir(), `beacon-${randomUUID()}.webm`)),
  ]);

  // Routing:
  //   provider="groq"           → call Groq directly (cloud paid opt-in)
  //   provider="local"/"auto" + runtime available → run local Whisper in-process
  //   provider="local"/"auto" + runtime missing   → enqueue for the user's daemon
  //                                                  to pick up and run on their
  //                                                  machine. This is what makes
  //                                                  fleetcrown.vercel.app's /control
  //                                                  use the user's local STT by
  //                                                  default — Vercel has no whisper.
  const useGroq = provider === "groq";
  const enqueueForDaemon = !useGroq && !isRuntimeAvailable();

  if (useGroq) {
    // Cloud transcription via Groq Whisper.
    const buf = Buffer.from(await audio.arrayBuffer());
    if (buf.length < 100) return NextResponse.json({ error: "Recording too short" }, { status: 422 });
    try {
      const blob = new Blob([buf], { type: audio.type || "audio/webm" });
      const text = await callGroqTranscribe(blob, audio.type || "audio/webm");
      if (!text) return NextResponse.json({ error: "No speech detected" }, { status: 422 });
      return NextResponse.json({ text });
    } catch (err) {
      // Surface auth/quota problems with actionable status codes + hints so a
      // user seeing "STT not working" sees the real cause in the network tab
      // instead of a generic 500. callGroqTranscribe throws messages shaped
      // "groq transcribe 401: <body>" — match on the status segment.
      const msg = err instanceof Error ? err.message : String(err);
      if (/groq transcribe 401/i.test(msg) || /invalid.*api.*key/i.test(msg)) {
        return NextResponse.json({
          error: "Groq API key invalid — rotate it at https://console.groq.com and update GROQ_API_KEY in your env.",
          detail: msg,
        }, { status: 502 });
      }
      if (/groq transcribe 429/i.test(msg) || /rate.?limit/i.test(msg)) {
        return NextResponse.json({
          error: "Groq rate-limited this transcription — retry in a moment or switch to local transcription.",
          detail: msg,
        }, { status: 429 });
      }
      if (/abort|timeout/i.test(msg)) {
        return NextResponse.json({
          error: "Groq transcription timed out (>30s) — try a shorter recording.",
          detail: msg,
        }, { status: 504 });
      }
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  if (enqueueForDaemon) {
    // No local runtime here (we're on Vercel) — enqueue a transcribe command for
    // the user's daemon to claim. Daemon already handles type="transcribe" with
    // payload { audio: <base64>, model? } and posts result via /api/control/commands.
    // The [id] route serves status from pending_commands.result on completion.
    const userId = await getApiUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const buf = Buffer.from(await audio.arrayBuffer());
    if (buf.length < 100) return NextResponse.json({ error: "Recording too short" }, { status: 422 });
    // Cap at ~6 MB raw (~8 MB base64) so a runaway recording doesn't blow up
    // the pending_commands jsonb column or the daemon's claim payload.
    if (buf.length > 6 * 1024 * 1024) {
      return NextResponse.json({
        error: "Recording too large for daemon bridge (>6 MB) — record a shorter clip or sign up for Groq cloud STT.",
      }, { status: 413 });
    }
    try {
      // Field names must match the daemon's jq selectors in
      // scripts/cockpit-daemon.sh:701-704 — `audio_b64` and `mime_type`.
      // `model` is included for forward compatibility but today's daemon
      // reads its whisper model from ~/.config/cockpit/beacon.json, not
      // the payload. (Future: daemon should prefer payload.model when set
      // so the user's DB-stored setting flows through end-to-end.)
      const id = await enqueuePendingCommand({
        userId,
        type: "transcribe",
        payload: {
          audio_b64: buf.toString("base64"),
          mime_type: audio.type || "audio/webm",
          model,
        },
      });
      return NextResponse.json({ transcriptionId: id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `enqueue failed: ${msg}` }, { status: 500 });
    }
  }

  // Local path: run Whisper directly.
  // Whisper receives a wav converted from the webm — avoids ffmpeg codec failures on
  // incomplete MediaRecorder output (Chrome sometimes produces webm without an EBML
  // EndOfFile tag, which makes Whisper's internal ffmpeg exit with status 254).
  const wavPath = webmPath.replace(".webm", ".wav");

  try {
    const buf = Buffer.from(await audio.arrayBuffer());
    if (buf.length < 100) return NextResponse.json({ error: "Recording too short" }, { status: 422 });
    await writeFile(webmPath, buf);

    try {
      await execFileAsync("ffmpeg", [
        "-nostdin", "-threads", "0",
        "-err_detect", "ignore_err",
        "-i", webmPath,
        "-f", "wav", "-ac", "1", "-ar", "16000", "-y", wavPath,
      ], { timeout: 15_000, encoding: "utf-8" });
    } catch {
      return NextResponse.json({ error: "Audio decode failed — recording may be too short or corrupt" }, { status: 422 });
    }

    const { stdout } = await execFileAsync("python3", [TRANSCRIBE_PY, wavPath, model], {
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
      encoding: "utf-8",
    });
    const text = stdout.trim();
    if (!text) return NextResponse.json({ error: "No speech detected" }, { status: 422 });
    return NextResponse.json({ text });
  } catch (err) {
    type ExecError = Error & { stderr?: string };
    const e = err as ExecError;
    const detail = e.stderr?.trim() || e.message;
    return NextResponse.json({ error: detail }, { status: 500 });
  } finally {
    await Promise.all([
      unlink(webmPath).catch(() => {}),
      unlink(wavPath).catch(() => {}),
    ]);
  }
}
