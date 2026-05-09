import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { homedir } from "os";
import { readJsonBody, z } from "@/lib/api/route-helpers";

const Body = z.object({
  prompts: z.array(z.string().trim().min(1)).min(2),
});

const TOOL_PATH = [
  `${homedir()}/.nvm/versions/node/v22.22.0/bin`,
  "/home/linuxbrew/.linuxbrew/bin",
  `${homedir()}/.local/bin`,
  `${homedir()}/go/bin`,
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
].join(":");

// Runs openclaw in a detached process group so we can kill the whole tree on timeout.
// Node exec only kills the direct child (the shell); this ensures grandchildren die too.
function runMerge(prompt: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const safe = prompt.replace(/'/g, "'\\''");
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
      resolve(stdout);
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export async function POST(req: NextRequest) {
  const dataOrResp = await readJsonBody(req, Body);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const { prompts } = dataOrResp;
  const numbered = prompts.map((p, i) => `${i + 1}. ${p}`).join("\n");
  const message = `I have ${prompts.length} tasks to send to an AI coding agent. Merge them into one concise, coherent prompt that covers all the work naturally. Output ONLY the merged prompt — no preamble, no explanation, no quotes.\n\nTasks:\n${numbered}`;

  // Local model inference takes 3-5 min; 360s ceiling ensures it completes or times out cleanly.
  let raw: string;
  try {
    raw = await runMerge(message, 360000);
  } catch {
    return NextResponse.json({ error: "AI unavailable — please try again." }, { status: 500 });
  }

  try {
    const data = JSON.parse(raw);
    const merged = (data?.outputs?.[0]?.text ?? "").trim();
    if (!merged) return NextResponse.json({ error: "Empty response — please try again." }, { status: 500 });
    return NextResponse.json({ ok: true, merged });
  } catch {
    return NextResponse.json({ error: "AI unavailable — please try again." }, { status: 500 });
  }
}
