import { exec, execFile } from "child_process";
import { homedir } from "os";
import { EXEC_TIMEOUT_MS } from "@/lib/constants/time";

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
  timeout = EXEC_TIMEOUT_MS,
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

/**
 * Run a local tool with arguments passed as an ARRAY (never a shell string).
 *
 * Use this — not `runTool` — whenever any argument is user-derived (e.g. a
 * Loki-proposed calendar title/location). `execFile` with `shell: false` hands
 * argv straight to the binary, so titles like `"; rm -rf ~"` are inert data, not
 * shell syntax. This is the safe seam that lets the "runTool must never accept
 * user-derived input" rule hold while still driving CLIs like `gog`.
 */
export function runToolArgs(
  file: string,
  args: string[],
  timeout = EXEC_TIMEOUT_MS,
  extraEnv: Record<string, string> = {},
): Promise<{ ok: boolean; data?: string; error?: string }> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      {
        timeout,
        shell: false,
        env: { ...process.env, PATH: TOOL_PATH, HOME, ...extraEnv },
      },
      (err, stdout, stderr) => {
        if (err) {
          const detail = stderr?.trim() ? ` | stderr: ${stderr.trim().slice(0, 500)}` : "";
          resolve({ ok: false, error: err.message + detail });
        } else {
          resolve({ ok: true, data: stdout.trim() });
        }
      },
    );
  });
}
