import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink, readFile } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { tmpdir, homedir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

const execFileAsync = promisify(execFile);
const TRANSCRIBE_PY = join(process.cwd(), "scripts/transcribe.py");
const SETTINGS_PATH = join(homedir(), ".config", "agent-dashboard-settings.json");

async function whisperModel(): Promise<string> {
  try {
    const raw = await readFile(SETTINGS_PATH, "utf-8");
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

  const [model, tmpPath] = await Promise.all([
    whisperModel(),
    Promise.resolve(join(tmpdir(), `beacon-${randomUUID()}.webm`)),
  ]);

  try {
    await writeFile(tmpPath, Buffer.from(await audio.arrayBuffer()));
    const { stdout } = await execFileAsync("python3", [TRANSCRIBE_PY, tmpPath, model], {
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
    });
    const text = stdout.trim();
    if (!text) return NextResponse.json({ error: "No speech detected" }, { status: 422 });
    return NextResponse.json({ text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}
