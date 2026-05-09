import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { homedir } from "os";
import { readJsonBody, z } from "@/lib/api/route-helpers";

const Body = z.object({
  prompts: z.array(z.string().trim().min(1)).min(2),
});

// ── Groq (fast path — seconds, free tier) ──────────────────────────────────
// Set GROQ_API_KEY in .env.local to enable. Falls back to openclaw (Codex, 4+ min).
async function mergeViaGroq(message: string): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("no key");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: message }],
      max_tokens: 500,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) throw new Error(`groq ${res.status}`);
  const data = await res.json();
  return (data?.choices?.[0]?.message?.content ?? "").trim();
}

// ── openclaw fallback (slow — local Codex model, 3-5 min) ──────────────────
const TOOL_PATH = [
  `${homedir()}/.nvm/versions/node/v22.22.0/bin`,
  "/home/linuxbrew/.linuxbrew/bin",
  `${homedir()}/.local/bin`,
  `${homedir()}/go/bin`,
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
].join(":");

function mergeViaOpenclaw(prompt: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const safe = prompt.replace(/'/g, "'\\''");
    // Detached process group so SIGKILL reaches openclaw's children (openclaw-infer).
    const child = spawn(
      "bash",
      ["-c", `openclaw capability model run --prompt '${safe}' --json </dev/null 2>/dev/null`],
      {
        detached: true,
        stdio: ["ignore", "pipe", "ignore"],
        env: { ...process.env, PATH: TOOL_PATH, HOME: homedir() },
      },
    );

    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });

    const timer = setTimeout(() => {
      try { process.kill(-child.pid!, "SIGKILL"); } catch {}
      reject(new Error("timeout"));
    }, timeoutMs);

    child.on("close", () => {
      clearTimeout(timer);
      try {
        const data = JSON.parse(stdout);
        resolve((data?.outputs?.[0]?.text ?? "").trim());
      } catch {
        reject(new Error("parse error"));
      }
    });

    child.on("error", (err) => { clearTimeout(timer); reject(err); });
  });
}

export async function POST(req: NextRequest) {
  const dataOrResp = await readJsonBody(req, Body);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const { prompts } = dataOrResp;
  const numbered = prompts.map((p, i) => `${i + 1}. ${p}`).join("\n");
  const message = `I have ${prompts.length} tasks to send to an AI coding agent. Merge them into one concise, coherent prompt that covers all the work naturally. Output ONLY the merged prompt — no preamble, no explanation, no quotes.\n\nTasks:\n${numbered}`;

  // Try Groq first (fast). Fall back to local openclaw (slow, ~4 min).
  try {
    const merged = await mergeViaGroq(message);
    if (merged) return NextResponse.json({ ok: true, merged });
  } catch {
    // Groq unavailable or no key — fall through to openclaw
  }

  try {
    const merged = await mergeViaOpenclaw(message, 360000);
    if (merged) return NextResponse.json({ ok: true, merged });
    return NextResponse.json({ error: "Empty response — please try again." }, { status: 500 });
  } catch {
    return NextResponse.json({ error: "AI unavailable — please try again." }, { status: 500 });
  }
}
