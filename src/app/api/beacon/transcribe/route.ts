import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { isRuntimeAvailable } from "@/lib/runtime";
import { callGroqTranscribe } from "@/lib/groq";
import { getApiUserId } from "@/lib/session";
import { getBeaconSettings } from "@/db/queries/beacon-settings";

const execFileAsync = promisify(execFile);
const TRANSCRIBE_PY = join(process.cwd(), "scripts/transcribe.py");

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

  const useGroq = provider === "groq" || (provider !== "local" && !isRuntimeAvailable());

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
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  if (!isRuntimeAvailable()) {
    return NextResponse.json({ error: "Local transcription unavailable — runtime not active" }, { status: 503 });
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
