/**
 * The model seam for Loki's tool loop — one call, two tool protocols.
 *
 * Loki must work on models that will not always be frontier. The hard part is
 * that tool calling is where cheap models diverge most: some support OpenAI's
 * native `tools` field, some accept it and ignore it, some emit a plausible
 * *description* of a call instead of the call, and some have no support at all.
 * A loop built on native tool calling alone simply stops working on half the
 * models it is supposed to run on.
 *
 * So both protocols are always live:
 *
 *   NATIVE  — `tools` + `tool_calls`, used when the provider returns them.
 *   TEXT    — a line protocol the model writes into its ordinary reply:
 *
 *                 TOOL: search_people
 *                 ARGS: {"query": "Elena"}
 *
 * Every response is scanned for BOTH, and the results are merged. That is not
 * belt-and-braces: it is the single highest-yield behaviour here, because a
 * model that "narrates" a tool call in prose while native calling is enabled is
 * the most common small-model failure, and under a native-only parser that
 * narration reaches the user as a hallucinated result. Reading it as a real
 * call turns the failure into a working turn.
 *
 * The text protocol is line-based rather than nested JSON on purpose. An 8B
 * model reliably reproduces `TOOL:` / `ARGS:` on their own lines; the same
 * model routinely breaks nested-JSON escaping. The format is chosen for the
 * weakest model expected to run it, not the strongest.
 */
import { HTTP_TIMEOUT_LONG_MS } from "@/lib/constants/time";
import { classifyGroqLimit, groqRetryAfterSeconds, humanizeWait } from "@/lib/agent/groq-error";
import { chainFrom, type ChatLink } from "@/config/chat-models";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Native protocol bookkeeping — echoed back so the provider can match calls. */
  tool_call_id?: string;
  name?: string;
};

export type ToolCall = {
  /** Native id when the provider gave one; synthesised for text-protocol calls. */
  id: string;
  name: string;
  args: Record<string, unknown>;
};

export type ModelTurn = {
  /** Prose the model produced, with any text-protocol call lines stripped. */
  text: string;
  /** Calls found via either protocol, de-duplicated. */
  toolCalls: ToolCall[];
  model: string;
  /**
   * Tokens this call actually cost, as the PROVIDER counted them.
   *
   * Reported rather than estimated because the budget being rationed is the
   * provider's, and our own char/4 estimate is only good enough for deciding
   * what fits in a prompt — billing a user's daily share against a guess would
   * drift a little every turn and a lot by evening. 0 when the provider omits
   * `usage`, which reads as "unknown", never as "free".
   */
  usageTokens: number;
};

/**
 * Extract text-protocol calls.
 *
 * Forgiving by design — every leniency here is a small-model behaviour observed
 * in practice rather than a hypothetical:
 *   - wraps the block in ``` fences
 *   - omits ARGS entirely for a no-argument tool
 *   - writes `TOOL: search_people(...)` with the parens it saw in the example
 *   - emits several calls in one reply
 * Rejecting any of these would fail the turn over formatting, which is the
 * failure mode this protocol exists to avoid.
 */
export function parseTextToolCalls(text: string, validNames: string[]): ToolCall[] {
  const calls: ToolCall[] = [];
  const valid = new Set(validNames);
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*(?:[-*>]\s*)?(?:\*\*)?TOOL(?:\*\*)?\s*[:=]\s*(.+?)\s*$/i.exec(lines[i]);
    if (!m) continue;
    // Tolerate `name(...)`, backticks, and trailing punctuation copied from prose.
    const name = m[1].replace(/[`*]/g, "").replace(/\(.*$/, "").replace(/[.,;]$/, "").trim();
    if (!valid.has(name)) continue;

    // ARGS may sit on the next non-empty line, or a couple below if the model
    // inserted a fence. Scan a short window rather than requiring adjacency.
    let args: Record<string, unknown> = {};
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const a = /^\s*(?:[-*>]\s*)?(?:\*\*)?ARGS(?:\*\*)?\s*[:=]\s*(.*)$/i.exec(lines[j]);
      if (a) {
        // The object may continue past this line — a model that opens a ```json
        // fence puts the brace on the NEXT line, and a pretty-printed object
        // spans several. Join forward to the end of the window and let the
        // brace-matching parser find where it actually closes; taking only the
        // ARGS line would silently yield {} and drop the model's arguments.
        const rest = lines.slice(j, Math.min(j + 8, lines.length)).join("\n");
        args = safeJsonObject(a[1]) ?? safeJsonObject(rest.replace(/^[^:]*[:=]/, "")) ?? {};
        break;
      }
      // A new TOOL line means this call simply had no arguments.
      if (/^\s*(?:\*\*)?TOOL(?:\*\*)?\s*[:=]/i.test(lines[j])) break;
    }
    calls.push({ id: `text_${calls.length}_${name}`, name, args });
  }
  return calls;
}

/** Parse a JSON object, tolerating fences and trailing prose. Null if hopeless. */
function safeJsonObject(raw: string): Record<string, unknown> | null {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  // `null` and `{}` must stay distinguishable. Returning `{}` for "nothing
  // parseable here" would satisfy the caller's `??` fallback and silently
  // discard arguments that were merely on the NEXT line — which is exactly what
  // a model does when it opens a ```json fence after `ARGS:`.
  if (!cleaned) return null;
  if (cleaned === "{}") return {};
  const start = cleaned.indexOf("{");
  if (start === -1) return null;
  // Walk to the matching brace so trailing commentary does not break the parse.
  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === "{") depth++;
    else if (cleaned[i] === "}") {
      depth--;
      if (depth === 0) {
        try {
          const parsed: unknown = JSON.parse(cleaned.slice(start, i + 1));
          return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Remove text-protocol lines from prose so a call the model narrated never
 * reaches the operator as if it were an answer.
 */
export function stripToolCallLines(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((l) => !/^\s*(?:[-*>]\s*)?(?:\*\*)?(?:TOOL|ARGS)(?:\*\*)?\s*[:=]/i.test(l))
    .join("\n")
    .replace(/```(?:json)?\s*```/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type NativeToolCall = { id?: string; function?: { name?: string; arguments?: string } };

export type ModelCallInput = {
  messages: ChatMessage[];
  tools: Array<Record<string, unknown>>;
  validToolNames: string[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
};

/**
 * Why one link refused, in the only terms the walker can act on.
 *
 * `size` and `daily` are separated from ordinary `capacity` because they demand
 * different moves, and conflating them has broken this loop twice — see
 * `groq-error.ts` for the full account.
 */
type FailureKind = "size" | "daily" | "capacity" | "other";

class LinkError extends Error {
  constructor(
    readonly kind: FailureKind,
    message: string,
  ) {
    super(message);
  }
}

/** One request to one (provider, model). Throws LinkError; never retries. */
async function callOneLink(
  link: ChatLink,
  input: ModelCallInput,
  tools: Array<Record<string, unknown>>,
): Promise<ModelTurn> {
  const key = process.env[link.provider.keyEnv];
  if (!key) throw new LinkError("other", `${link.provider.keyEnv} not set`);

  const res = await fetch(`${link.provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: link.model,
      messages: input.messages,
      // Advertised, not depended on. Providers that reject an unknown field are
      // handled by the retry in the walker rather than by feature-detection
      // tables that would go stale the moment a provider ships a change.
      ...(tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
      max_tokens: input.maxTokens ?? 1400,
      temperature: input.temperature ?? 0.2,
    }),
    signal: AbortSignal.timeout(input.timeoutMs ?? HTTP_TIMEOUT_LONG_MS),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // A 400 mentioning tools means this model cannot take the native field. The
    // walker retries the SAME link without it — the text protocol is already in
    // the prompt, so the turn still works. This is why the loop degrades to weak
    // models instead of failing on them.
    if (res.status === 400 && /tool/i.test(body) && tools.length > 0) {
      throw new LinkError("other", `native tools rejected: ${body.slice(0, 120)}`);
    }
    if (res.status === 429) {
      const kind = classifyGroqLimit(body);
      const wait = humanizeWait(groqRetryAfterSeconds(body));
      // Keep the wording the shed ladder greps for — `loop.ts` recognises
      // "request too large" and retries with fewer facts.
      if (kind === "size") {
        throw new LinkError("size", `${link.model} 429 request too large: ${body.slice(0, 160)}`);
      }
      if (kind === "daily") {
        throw new LinkError(
          "daily",
          `${link.provider.id} 429 daily quota exhausted${wait ? ` (retry in ${wait})` : ""}: ${body.slice(0, 160)}`,
        );
      }
      throw new LinkError("capacity", `${link.model} 429 rate-limited${wait ? ` (retry in ${wait})` : ""}`);
    }
    throw new LinkError("other", `${link.model} ${res.status}${body ? `: ${body.slice(0, 120)}` : ""}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string; tool_calls?: NativeToolCall[] } }>;
    usage?: { total_tokens?: number };
  };
  const msg = data.choices?.[0]?.message;
  const rawText = (msg?.content ?? "").trim();

  const native: ToolCall[] = (msg?.tool_calls ?? [])
    .map((tc, i) => ({
      id: tc.id ?? `native_${i}`,
      name: tc.function?.name ?? "",
      args: safeJsonObject(tc.function?.arguments ?? "{}") ?? {},
    }))
    .filter((tc) => tc.name && input.validToolNames.includes(tc.name));

  // Merge, preferring native. A model sometimes emits BOTH — the native call and
  // a prose echo of it — and running the tool twice wastes a round trip and can
  // double-propose an action, so dedupe on name+args.
  const seen = new Set(native.map((c) => `${c.name}:${JSON.stringify(c.args)}`));
  const fromText = parseTextToolCalls(rawText, input.validToolNames).filter((c) => {
    const k = `${c.name}:${JSON.stringify(c.args)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return {
    text: stripToolCallLines(rawText),
    toolCalls: [...native, ...fromText],
    model: `${link.provider.id}/${link.model}`,
    usageTokens: Math.max(0, Math.round(data.usage?.total_tokens ?? 0)),
  };
}

/**
 * One link, with NO fallback — for probes and diagnostics.
 *
 * Production uses the chain walker below. This exists because a walk cannot give
 * a verdict PER MODEL: it reports whoever answered, so probing "is gemma usable?"
 * through it would happily return a Groq success and call gemma fine. Pinning a
 * model into the chain on that evidence is how free-model rot goes unnoticed.
 */
export async function callModelLinkOnce(link: ChatLink, input: ModelCallInput): Promise<ModelTurn> {
  try {
    return await callOneLink(link, input, input.tools);
  } catch (e) {
    if (e instanceof LinkError && /native tools rejected/.test(e.message) && input.tools.length > 0) {
      return callOneLink(link, input, []);
    }
    throw e;
  }
}

/**
 * One model turn, taken by the first link in the chain that answers.
 *
 * The walk encodes what each refusal actually means:
 *
 *   size     — this prompt exceeds THIS vendor's per-request allowance. Another
 *              vendor may have a far larger window (Groq meters ~12k tokens per
 *              minute; the OpenRouter free models carry 128k–1M context), so the
 *              walk continues. Only when EVERY link says size is the size error
 *              surfaced — that is the signal `loop.ts` sheds facts on, and it
 *              must not fire while a link that could have answered remains.
 *   daily    — this VENDOR is done until its budget resets. Every remaining
 *              model of that vendor draws on the same exhausted pool, so they
 *              are skipped wholesale rather than tried one by one.
 *   capacity — a momentary window. Advance; a different model or vendor has its
 *              own window.
 *
 * If the whole chain refuses on capacity alone, the windows are short by
 * definition, so wait ONCE, bounded, and walk it again: a 20s-slower right
 * answer beats falling back to a path that cannot read the tables the question
 * is about.
 */
export async function callModelWithTools(
  input: ModelCallInput & { /** Internal: set after the one bounded wait. */ waited429?: boolean },
): Promise<ModelTurn> {
  const chain = chainFrom(input.model ?? process.env.LOKI_MODEL);
  if (chain.length === 0) {
    throw new Error("no chat provider configured (set GROQ_API_KEY or OPENROUTER_API_KEY)");
  }

  const failures: string[] = [];
  const kinds = new Set<FailureKind>();
  const drained = new Set<string>();

  for (const link of chain) {
    if (drained.has(link.provider.id)) continue;
    // Two attempts at most: the second drops the native `tools` field for a
    // model that rejected it.
    for (const tools of [input.tools, [] as Array<Record<string, unknown>>]) {
      try {
        const turn = await callOneLink(link, input, tools);
        if (failures.length > 0) {
          console.warn(`[loki] answered on ${turn.model} after ${failures.length} refusal(s): ${failures.join("; ")}`);
        }
        return turn;
      } catch (e) {
        const err = e instanceof LinkError ? e : new LinkError("other", e instanceof Error ? e.message : String(e));
        // Retry this same link without native tools, once.
        if (err.kind === "other" && /native tools rejected/.test(err.message) && tools.length > 0) continue;
        failures.push(err.message);
        kinds.add(err.kind);
        if (err.kind === "daily") drained.add(link.provider.id);
        break;
      }
    }
  }

  // Every link refused on a momentary window — the one case where waiting is
  // the right move rather than a wasted 25 seconds.
  if (!input.waited429 && kinds.has("capacity") && !kinds.has("size")) {
    console.warn(`[loki] whole chain rate-limited — waiting 15s for a window`);
    await new Promise((r) => setTimeout(r, 15_000));
    return callModelWithTools({ ...input, waited429: true });
  }

  // Surface the most ACTIONABLE failure, not the last one. Only `size` gives the
  // caller something to do (shed facts and retry), so it wins when present.
  const summary = failures.join("; ");
  if (kinds.has("size")) throw new Error(`request too large on every model: ${summary}`);
  if (kinds.has("daily")) throw new Error(`daily quota exhausted: ${summary}`);
  throw new Error(`no chat model answered: ${summary}`);
}
