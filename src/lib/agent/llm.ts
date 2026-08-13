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
import { GROQ_FAST_MODEL } from "@/lib/groq";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

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

/**
 * One model turn. `tools` are advertised natively; the text protocol is always
 * parsed regardless, so a model that ignores the native field still works.
 */
export async function callModelWithTools(input: {
  messages: ChatMessage[];
  tools: Array<Record<string, unknown>>;
  validToolNames: string[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}): Promise<ModelTurn> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not set");
  const model = input.model ?? process.env.LOKI_MODEL?.trim() ?? GROQ_FAST_MODEL;

  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: input.messages,
      // Advertised, not depended on. Providers that reject an unknown field are
      // handled by the retry below rather than by feature-detection tables that
      // would go stale the moment a provider ships a change.
      ...(input.tools.length > 0 ? { tools: input.tools, tool_choice: "auto" } : {}),
      max_tokens: input.maxTokens ?? 1400,
      temperature: input.temperature ?? 0.2,
    }),
    signal: AbortSignal.timeout(input.timeoutMs ?? HTTP_TIMEOUT_LONG_MS),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // A 400 mentioning tools means this model cannot take the native field.
    // Retry once WITHOUT it: the text protocol is in the prompt already, so the
    // turn still works. This is why the loop degrades to weak models instead of
    // failing on them.
    if (res.status === 400 && /tool/i.test(body) && input.tools.length > 0) {
      return callModelWithTools({ ...input, tools: [] });
    }
    throw new Error(`groq ${res.status}${body ? `: ${body.slice(0, 160)}` : ""}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string; tool_calls?: NativeToolCall[] } }>;
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

  return { text: stripToolCallLines(rawText), toolCalls: [...native, ...fromText], model };
}
