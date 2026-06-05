/**
 * Typed IPC boundary for cloud-dispatched pending_commands rows.
 *
 * Pre-v0.7 the poller did `command.payload as { tab?: string; prompt?: string }`
 * — an unchecked cast. That worked while the cloud was the only source of
 * commands and we trusted its serialization. Once the autonomous scheduler
 * (Change 5) starts INSERT'ing pending_commands unattended via cron, the
 * boundary needs to refuse:
 *   - unknown command.type values (a misconfigured cron typo)
 *   - missing required payload fields (the cron forgot to attach a tab)
 *   - non-string fields where strings are expected (DB corruption, manual
 *     INSERT with wrong types)
 *
 * Hand-rolled guards rather than zod because the desktop main-process
 * bundle stays lean — adding a runtime validation dep for one function
 * is overkill. If we add more command types in the desktop's pipeline,
 * revisit the dep tradeoff.
 *
 * Mirrors the per-type payload contracts defined in
 * src/db/schema/pending-commands.ts on the cloud side. Keep the two in sync
 * by hand for now (only the inject path is desktop-active today).
 */

export interface InjectCommand {
  type: 'inject'
  payload: {
    tab: string
    prompt: string
    /** Optional model + adapter hints — daemon-bash respects these but the
     *  desktop's inject path just types into the existing zellij tab, so
     *  we accept-but-don't-act on them rather than rejecting. */
    promptKey?: string
    promptLabel?: string
    adapter?: string
    model?: string
    projectId?: string | null
    projectKey?: string
    runId?: string
  }
}

/** Every command type the desktop is allowed to execute today. Adding a
 *  new type means: extend this union + write a guard + handle it in poller. */
export type ValidatedCommand = InjectCommand

export type ValidationResult =
  | { ok: true; command: ValidatedCommand }
  | { ok: false; error: string }

/**
 * Validate a raw command row pulled from /api/control/commands or the
 * bridge SSE payload. Returns either a tagged-union narrowed command or
 * a structured error explaining the rejection.
 */
export function validateCommand(raw: unknown): ValidationResult {
  if (!isObject(raw)) {
    return { ok: false, error: 'Command must be an object' }
  }
  const type = (raw as { type?: unknown }).type
  if (typeof type !== 'string') {
    return { ok: false, error: 'Command.type must be a string' }
  }
  const payload = (raw as { payload?: unknown }).payload
  if (!isObject(payload)) {
    return { ok: false, error: 'Command.payload must be an object' }
  }

  switch (type) {
    case 'inject':
      return validateInject(payload)
    default:
      return {
        ok: false,
        error: `Fleet Runner v0.7 does not yet handle command type '${type}'. Add it to command-validator.ts when you wire a new executor.`,
      }
  }
}

function validateInject(payload: Record<string, unknown>): ValidationResult {
  const tab = payload.tab
  const prompt = payload.prompt
  if (typeof tab !== 'string' || tab.trim().length === 0) {
    return { ok: false, error: "Inject payload missing required string 'tab'" }
  }
  if (typeof prompt !== 'string' || prompt.length === 0) {
    return { ok: false, error: "Inject payload missing required string 'prompt'" }
  }
  // Optional fields — accept if absent or if the right primitive type;
  // refuse if present-but-wrong-type so the boundary catches drift early.
  for (const field of ['promptKey', 'promptLabel', 'adapter', 'model', 'projectKey', 'runId'] as const) {
    const v = payload[field]
    if (v !== undefined && typeof v !== 'string') {
      return { ok: false, error: `Inject payload field '${field}' must be a string if present` }
    }
  }
  if (payload.projectId !== undefined && payload.projectId !== null && typeof payload.projectId !== 'string') {
    return { ok: false, error: "Inject payload field 'projectId' must be a string or null if present" }
  }

  return {
    ok: true,
    command: {
      type: 'inject',
      payload: {
        tab,
        prompt,
        promptKey: payload.promptKey as string | undefined,
        promptLabel: payload.promptLabel as string | undefined,
        adapter: payload.adapter as string | undefined,
        model: payload.model as string | undefined,
        projectId: (payload.projectId ?? null) as string | null,
        projectKey: payload.projectKey as string | undefined,
        runId: payload.runId as string | undefined,
      },
    },
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}
