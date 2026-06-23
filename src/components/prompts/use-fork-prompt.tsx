"use client";

import { useState } from "react";
import { postJson } from "@/lib/api/fetch";
import type { PromptTemplate } from "@/config/prompt-library";
import { FEEDBACK_SHORT_MS } from "@/lib/constants/timings";

export type ForkState = "idle" | "forking" | "done" | "error";

/**
 * Fork a FleetCrown default into a user-owned copy. The default's body becomes
 * the editable body of a new `fc-default-fork` row, tracked back to its origin
 * via `forkedFromKey`. This is the missing control behind the "fork a default"
 * copy in UserPromptsSection — the DB already supported it.
 *
 * Project-scoped defaults can't be forked to a global row without a project
 * (createPrompt rejects scope='project' without projectId), so a forked copy
 * is always created as global — the user can re-pin it via Edit afterwards.
 */
export function useForkPrompt(template: PromptTemplate, onForked: () => void) {
  const [state, setState] = useState<ForkState>("idle");

  async function fork() {
    if (state === "forking") return;
    setState("forking");
    try {
      const res = await postJson("/api/prompts", {
        name: template.name,
        description: template.description || null,
        body: template.template,
        scope: "global",
        tags: template.tags ?? [],
        source: "fc-default-fork",
        forkedFromKey: template.id,
      });
      if (!res.ok) {
        setState("error");
        setTimeout(() => setState("idle"), FEEDBACK_SHORT_MS);
        return;
      }
      setState("done");
      onForked();
      setTimeout(() => setState("idle"), FEEDBACK_SHORT_MS);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), FEEDBACK_SHORT_MS);
    }
  }

  return { fork, state };
}
