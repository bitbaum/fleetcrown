import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink, readFile } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { BEACON_SETTINGS_PATH } from "@/config/beacon";

const execFileAsync = promisify(execFile);
const TRANSCRIBE_PY = join(process.cwd(), "scripts/transcribe.py");

async function whisperModel(): Promise<string> {
  try {
    const raw = await readFile(BEACON_SETTINGS_PATH, "utf-8");
    const s = JSON.parse(raw) as Record<string, unknown>;
    const m = s["whisper_model"];
    if (typeof m === "string" && m.length > 0) return m;
  } catch { /* settings missing or malformed — use default */ }
  return "base";
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const audio = form.get("audio") as File | null;
  if (!audio) return NextResponse.json({ error: "No audio" }, { status: 400 });

  const [model, webmPath] = await Promise.all([
    whisperModel(),
    Promise.resolve(join(tmpdir(), `beacon-${randomUUID()}.webm`)),
  ]);
  // Whisper receives a wav converted from the webm — avoids ffmpeg codec failures on
  // incomplete MediaRecorder output (Chrome sometimes produces webm without an EBML
  // EndOfFile tag, which makes Whisper's internal ffmpeg exit with status 254).
  const wavPath = webmPath.replace(".webm", ".wav");

  try {
    const buf = Buffer.from(await audio.arrayBuffer());
    if (buf.length < 100) return NextResponse.json({ error: "Recording too short" }, { status: 422 });
    await writeFile(webmPath, buf);

    // Pre-convert to wav with lenient error detection. Fails fast with a clear message
    // instead of a cryptic Python traceback from inside Whisper's ffmpeg subprocess.
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

    // execFile returns strings when encoding is specified — stderr is usable in catch.
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
