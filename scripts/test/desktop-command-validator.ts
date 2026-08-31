import assert from "node:assert/strict";
import { validateCommand } from "../../desktop/src/main/command-validator";

const validCases = [
  { type: "inject", payload: { tab: "truthseeker", prompt: "summarize this repo" } },
  { type: "focus_tab", payload: { tab: "truthseeker" } },
  { type: "close_tab", payload: { tab: "truthseeker" } },
  {
    type: "launch_agent",
    payload: {
      tab: "truthseeker",
      dir: "/home/g/dev/truthseeker",
      agent: "claude",
      model: "sonnet",
    },
  },
  {
    type: "switch_agent",
    payload: {
      tab: "truthseeker",
      dir: "/home/g/dev/truthseeker",
      toAgent: "codex",
      fromAgent: "claude",
    },
  },
  { type: "auto_continue", payload: { tab: "truthseeker", enabled: true } },
  { type: "install_cli", payload: { agent: "gemini" } },
  { type: "peek_tab", payload: { tab: "truthseeker" } },
] as const;

for (const command of validCases) {
  const result = validateCommand(command);
  assert.equal(result.ok, true, `${command.type} should validate`);
  if (result.ok) assert.equal(result.command.type, command.type);
}

const invalidCases = [
  { command: { type: "inject", payload: { tab: "truthseeker" } }, error: "prompt" },
  {
    command: { type: "launch_agent", payload: { tab: "truthseeker", agent: "claude" } },
    error: "dir",
  },
  {
    command: { type: "switch_agent", payload: { tab: "truthseeker", dir: "/tmp" } },
    error: "toAgent",
  },
  {
    command: { type: "auto_continue", payload: { tab: "truthseeker", enabled: "true" } },
    error: "enabled",
  },
  { command: { type: "install_cli", payload: {} }, error: "agent" },
  { command: { type: "peek_tab", payload: {} }, error: "tab" },
  { command: { type: "transcribe", payload: {} }, error: "does not handle" },
  { command: { type: "repair_helper", payload: {} }, error: "does not handle" },
] as const;

for (const { command, error } of invalidCases) {
  const result = validateCommand(command);
  assert.equal(result.ok, false, `${command.type} should fail validation`);
  if (!result.ok) assert.match(result.error, new RegExp(error));
}

console.log(
  `${validCases.length + invalidCases.length}/${validCases.length + invalidCases.length} desktop command validator cases passed`,
);
