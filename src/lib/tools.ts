import { exec } from "child_process";
import { homedir } from "os";

const HOME = homedir();
const TOOL_PATH = [
  `${HOME}/.nvm/versions/node/v22.22.0/bin`,
  "/home/linuxbrew/.linuxbrew/bin",
  `${HOME}/.local/bin`,
  `${HOME}/go/bin`,
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
].join(":");

export function runTool(
  command: string,
  timeout = 15000,
  extraEnv: Record<string, string> = {},
): Promise<{ ok: boolean; data?: string; error?: string }> {
  return new Promise((resolve) => {
    exec(
      command,
      {
        timeout,
        shell: "/bin/bash",
        env: { ...process.env, PATH: TOOL_PATH, HOME, ...extraEnv },
      },
      (err, stdout, stderr) => {
        if (err) {
          // Include stderr in error for debugging
          const detail = stderr?.trim() ? ` | stderr: ${stderr.trim().slice(0, 500)}` : "";
          resolve({ ok: false, error: err.message + detail });
        } else {
          resolve({ ok: true, data: stdout.trim() });
        }
      },
    );
  });
}
