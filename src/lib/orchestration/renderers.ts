import { getOrchestrationIntent } from "./intents";
import type { AdapterId, OrchestrationTaskRequest } from "./contract";

function renderSharedHandoffBlock(): string {
  return [
    "When done, update the session handoff with exactly these lines:",
    "status: <ready | working>     # 'ready' = task fully done; 'working' = still more to do. Auto-inject only fires when 'ready'.",
    "done: <one sentence what you completed>",
    "next: <one sentence what remains>",
    "tests: <N pass · N fail, or 'no suite'>",
    "todos: <count> TODOs",
    "health: <good | needs attention | critical>",
  ].join("\n");
}

function renderSharedExecutionRules(): string {
  return [
    "Use first principles. Prefer the simplest correct change.",
    "Follow SSOT, SoC, DRY, YAGNI, and KISS.",
    "Do not stop at analysis if tool-driven execution can move the work forward.",
    "Verify meaningful changes with the smallest useful gate: tests, typecheck, lint, build, browser flow, or direct inspection.",
    "No scope creep. Pick the highest-impact next step and finish it fully unless blocked.",
  ].join("\n");
}

function renderIntentBody(request: OrchestrationTaskRequest): string {
  switch (request.intent) {
    case "next_best":
      return [
        `Work on the project at ${request.projectPath}.`,
        "Before choosing work, scan in order:",
        "1. interrupted or uncommitted work to resume",
        "2. failing tests or broken flows",
        "3. SSOT / DRY / quality violations",
        "4. mission or product misalignment",
        "Pick the highest-impact item and execute it fully.",
      ].join("\n");
    case "test_and_fix":
      return [
        `Run the full test and fix loop for ${request.projectPath}.`,
        "Run relevant tests first.",
        "Then inspect the primary user flows and fix the highest-value failures.",
        "If tests pass and flows look healthy, improve coverage for the most critical missing path.",
      ].join("\n");
    case "quality":
      return [
        `Run a code-quality pass for ${request.projectPath}.`,
        "Do not add new features.",
        "Reduce duplication, tighten SSOT boundaries, remove obvious debt, and simplify overgrown code.",
      ].join("\n");
    case "full_audit":
      return [
        `Run a comprehensive audit for ${request.projectPath}.`,
        "Check tests, types, TODO debt, incomplete features, and architectural rough edges.",
        "Create a priority list by user impact, then execute the top item fully.",
      ].join("\n");
    case "product":
      return [
        `Review ${request.projectPath} as a product owner.`,
        "Find the highest-leverage product improvement based on user pain, clarity, and impact this week.",
        "Then apply one concrete improvement.",
      ].join("\n");
    case "ux_review":
      return [
        `Review the UX of ${request.projectPath}.`,
        "Check readability, mobile behavior, empty/loading/error states, visual hierarchy, and interaction clarity.",
        "Fix the top issues you find.",
      ].join("\n");
    case "deploy_check":
      return [
        `Run a pre-deploy verification pass for ${request.projectPath}.`,
        "Check type safety, build health, tests, validation, secrets hygiene, incomplete features, and obvious security risks.",
        "Fix blockers before declaring the project ready.",
      ].join("\n");
    case "commit_push":
      return [
        `Prepare and ship the current work in ${request.projectPath}.`,
        "Verify quality first, then review the diff, create a conventional commit that explains why, and push.",
        "If deployment applies, monitor it and report the result.",
      ].join("\n");
    case "close_session":
      return [
        `Close the current work session for ${request.projectPath}.`,
        "Ensure the working tree is in a safe state, run quality checks, note test results, and leave a clean handoff.",
      ].join("\n");
    case "hard_stop":
      return "HARD STOP. Stop all work immediately. Do not run any more tools. Do not write any code. Do not make any changes. Say only \"Stopped.\" and stop.";
    case "continue":
      return [
        `Continue the current work in ${request.projectPath}.`,
        "Resolve the pending question using the available context and keep going without bouncing the same blocker back to the user.",
      ].join("\n");
    case "custom":
      return request.customInstructions?.trim() ?? "";
  }
}

export function renderTaskForAdapter(request: OrchestrationTaskRequest, adapter: AdapterId = request.adapter): string {
  const intent = getOrchestrationIntent(request.intent);

  // Claude adapter: CLAUDE.md is always loaded in the session and already contains
  // execution rules and project context. Emit only the intent body — no redundant
  // header or rules. buildPromptWithSession appends the session file + update instruction.
  if (adapter === "claude") {
    const sections: string[] = [renderIntentBody(request)];
    // For "custom" intent the body IS customInstructions — don't append it again
    if (request.intent !== "custom" && request.customInstructions?.trim()) {
      sections.push(`Additional instructions:\n${request.customInstructions.trim()}`);
    }
    return sections.join("\n\n");
  }

  const sections = [
    `Intent: ${intent.name}`,
    `Project: ${request.projectKey}`,
    renderIntentBody(request),
    renderSharedExecutionRules(),
  ];

  // For "custom" intent the body IS customInstructions — don't append it again
  if (request.intent !== "custom" && request.customInstructions?.trim()) {
    sections.push(`Additional instructions:\n${request.customInstructions.trim()}`);
  }

  // Claude and Codex receive the specific session-file path via buildPromptWithSession,
  // so the generic block would be a duplicate. OpenClaw uses this render output directly.
  if (intent.requiresSessionHandoff && adapter === "openclaw") {
    sections.push(renderSharedHandoffBlock());
  }

  if (adapter === "openclaw") {
    sections.push("Use OpenClaw-native tools and durable execution patterns where they reduce manual busywork.");
  }

  return sections.join("\n\n");
}
