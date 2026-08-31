/**
 * Loki's agentic loop — the in-app replacement for proxying the OpenClaw agent.
 *
 * Shape of a turn:
 *
 *   1. Seed context: cheap deterministic facts (projects) + the computed brief.
 *      Loki starts with what it would otherwise waste a round trip fetching.
 *   2. Model turn. It either answers or calls tools.
 *   3. Tool results come back as Facts and are ACCUMULATED into the turn's fact
 *      set — so everything a tool returned is citable, checkable, and rendered
 *      with its `<not recorded>` gaps intact.
 *   4. Repeat to a hard round cap.
 *   5. Verify the final answer against every fact gathered; one repair pass.
 *
 * The property that makes this different from the proxy it replaces: the fact
 * set IS the tool history. There is no channel by which a tool can put prose in
 * front of the model without it also becoming verifiable evidence. Under the
 * old design Loki answered a contacts question by grepping a JSON blob in
 * another agent's workspace, and nothing downstream could tell that the
 * "affiliation" it reported had never existed.
 *
 * Budgets are small on purpose. Weak models loop — they re-call a tool that
 * already answered, or ping-pong between two. Every bound here is a real
 * observed failure mode, not defensive padding, and the loop always degrades to
 * "answer with what you have" rather than to an error.
 */
import { assignFactIds, renderFacts, type Fact } from "@/lib/agent/core/facts";
import {
  trimFactsToBudget,
  mergeFactsWithCap,
  fitFactsToBudget,
  omissionNotice,
} from "@/lib/agent/fact-budget";
import {
  buildGroundedContext,
  buildContract,
  directiveId,
  NO_BASIS,
  type Directive,
} from "@/lib/agent/core/contract";
import { verifyAnswer, buildRepairPrompt, type Violation } from "@/lib/agent/core/verify";
import { callModelWithTools, type ChatMessage, type ToolCall } from "@/lib/agent/llm";
import {
  renderToolCatalog,
  toOpenAITools,
  toolNames,
  type ToolRegistry,
} from "@/lib/agent/tools/registry";
import { APP_NAME } from "@/config/brand";

// The concrete registry and the seed fetchers reach the database, and @/db
// throws at MODULE INIT when no connection string is set. Importing them lazily
// keeps this module pure to load: a caller that supplies its own registry and
// seed (the unit suite) never touches the database at all, and the production
// path pays one dynamic import per turn — noise next to a model round trip.
async function defaultRegistry(): Promise<ToolRegistry> {
  return (await import("@/lib/agent/tools/handlers")).LOKI_TOOLS;
}

async function defaultSeed(
  userId: string,
  message: string,
): Promise<{ facts: Fact[]; directives: Directive[] }> {
  const [{ projectFacts, peopleFacts }, { buildDailyBrief }] = await Promise.all([
    import("@/lib/agent/sources"),
    import("@/lib/agent/brief"),
  ]);
  const [people, projects, directives] = await Promise.all([
    peopleFacts(userId, message).catch(() => [] as Fact[]),
    projectFacts(userId).catch(() => [] as Fact[]),
    PLANNING_CUES.test(message)
      ? buildDailyBrief(userId).catch(() => [] as Directive[])
      : Promise.resolve([] as Directive[]),
  ]);
  // People first: a 40-fact cap would otherwise drop the person the operator just named.
  return { facts: [...people, ...projects], directives };
}

/** Model turns per request. 3 covers plan→gather→answer; more is usually a loop. */
const MAX_ROUNDS = 3;
/** Tool executions per round — enough to fan out, few enough to stay fast. */
const MAX_CALLS_PER_ROUND = 4;
/** Total facts carried. Past this, small models answer about the wrong record. */
const MAX_FACTS = 40;

/**
 * Token ceiling for ONE call, so a whole turn fits the provider's per-minute
 * allowance.
 *
 * Groq charges the entire request against a tokens-per-MINUTE budget — 12000 on
 * the 70B, 6000 on the 8B step-down — and a turn spends MAX_ROUNDS calls inside
 * that same minute. A full 40-fact prompt measured ~15000 tokens on its own, so
 * every turn exceeded the whole minute's allowance on its FIRST call and the
 * loop never completed a single round in production; answers came from the
 * toolless fallback instead, which cannot read the tables being asked about.
 *
 * Budgeting per call is what makes the loop possible at all: 12000 × 0.8 for
 * headroom, split across the rounds. The margin covers the estimator's slop and
 * the model's own reply, which is charged too.
 */
const CALL_TOKEN_BUDGET = Math.floor((12000 * 0.8) / MAX_ROUNDS);

const PLANNING_CUES =
  /\b(plan|today|day|urgent|priorit|attention|focus|stuck|due|deadline|overdue|next|habit|commit|risk|blocked|first)\b/i;

/**
 * The model call, as an injectable seam.
 *
 * Not a testing afterthought: loop CONTROL — round budgets, fact accumulation,
 * bad-argument recovery, whether the repair pass is allowed to make an answer
 * worse — is the part most likely to break and the part a live-model test can
 * never pin down, because the model's choices differ every run. Injecting a
 * scripted model makes all of that deterministic, so the suite stays in the
 * env-independent tier (no GROQ_API_KEY, no DB) and still covers the logic.
 */
export type ModelCaller = typeof callModelWithTools;

/** A citation the UI can resolve — what [F8] or [D1] actually refers to. */
export type CitationSource = { id: string; label: string; detail: string };

export type LoopResult = {
  text: string;
  facts: Fact[];
  /** Resolved citations, so the transcript can render an id as its record. */
  sources: CitationSource[];
  violations: Violation[];
  /** Tool names actually executed, in order — surfaced so the UI can show work. */
  toolsUsed: string[];
  rounds: number;
  model: string;
  /**
   * Tokens this whole turn cost, summed across every round AND the repair pass.
   * A turn is several calls; billing only the last one would under-count the
   * expensive turns by the most — exactly the ones worth rationing.
   */
  usageTokens: number;
};

/**
 * `canCallTools` is false on the round that must ANSWER (and on the repair
 * pass). Both disable tools at the API layer, but a prompt that still teaches
 * the TOOL:/ARGS: protocol and lists a catalog invites the model to write a
 * call anyway — and `stripToolCallLines` then removes those lines, leaving an
 * EMPTY reply. Observed in production: the loop ran all three rounds, produced
 * no text, and fell back to the gateway, which is exactly the degradation the
 * loop exists to avoid. Withholding the protocol also returns ~640 tokens to
 * the fact budget on the round that needs them most.
 */
export function systemPrompt(registry: ToolRegistry, canCallTools = true): string {
  const toolSection = canCallTools
    ? [
        "Call a tool by writing these two lines in your reply, exactly like this:",
        "",
        "TOOL: search_people",
        'ARGS: {"query": "Elena"}',
        "",
        "Write nothing else in a reply that calls tools — you will be given the results and asked again. You may call several tools at once by repeating the two lines.",
        "",
      ]
    : [
        "You have already gathered what you can. Answer NOW, in prose, from the facts below.",
        "You cannot call tools on this turn — do not write TOOL: or ARGS: lines. A reply containing only a tool call reaches the operator as an empty answer.",
        "",
      ];
  return [
    `You are Loki, the assistant inside ${APP_NAME} — the captain's layer over the operator's fleet of projects and agents.`,
    "",
    "## How you work",
    "You answer from the operator's own FleetCrown database, which you read through tools. You do not know anything about the operator that a tool has not returned.",
    "",
    ...toolSection,
    "## What you cannot do",
    `You have NO power to act. You cannot send a message, write to the calendar, or change anything. Your only lever is the ${APP_NAME} approval queue via propose_action, and the operator must approve each draft before anything happens. Never report an action as done. Never claim a sandbox or permission blocked you.`,
    "You have not browsed the web. If asked to research a person or company, say you cannot, and report only what the tools returned.",
    "",
    // The catalog is a list of things to call. On an answering round it is both
    // an invitation to do the one forbidden thing and the single largest block
    // of tokens in the prompt.
    ...(canCallTools ? ["## Tools", renderToolCatalog(registry), ""] : []),
    "## Answering",
    "Be concise and direct. Cite the record id for every claim about the operator.",
    `When a tool returns nothing, that is the answer — say "${NO_BASIS}" for that part and move on. A requested format never obliges you to invent an item; three cited items beat five where two are guessed.`,
  ].join("\n");
}

/** Execute one round's calls, capped. Unknown/failing tools become notes, not throws. */
async function runToolCalls(
  calls: ToolCall[],
  registry: ToolRegistry,
  ctx: { userId: string; message: string },
): Promise<{ facts: Fact[]; messages: ChatMessage[]; used: string[] }> {
  const facts: Fact[] = [];
  const messages: ChatMessage[] = [];
  const used: string[] = [];

  for (const call of calls.slice(0, MAX_CALLS_PER_ROUND)) {
    const tool = registry[call.name];
    if (!tool) {
      messages.push({
        role: "user",
        content: `[tool ${call.name}] no such tool. Available: ${toolNames(registry).join(", ")}`,
      });
      continue;
    }
    const parsed = tool.params.safeParse(call.args);
    if (!parsed.success) {
      // Hand back the shape rather than the zod dump — a weak model repairs from
      // an example far more reliably than from a validation error object.
      messages.push({
        role: "user",
        content: `[tool ${call.name}] bad arguments. Use exactly:\n${tool.example}`,
      });
      continue;
    }
    used.push(call.name);
    try {
      const result = await tool.handler(parsed.data, ctx);
      facts.push(...result.facts);
      messages.push({
        role: "user",
        content:
          result.facts.length > 0
            ? `[tool ${call.name}] returned ${result.facts.length} record(s) — they are in the Records block below.`
            : `[tool ${call.name}] ${result.note ?? "returned nothing."}`,
      });
    } catch (e) {
      // A failed tool must read as "unknown", never as "none" — otherwise the
      // model reports an outage as an empty result and the operator believes it.
      messages.push({
        role: "user",
        content: `[tool ${call.name}] FAILED (${e instanceof Error ? e.message.slice(0, 80) : "error"}). Treat this as unknown, not as empty.`,
      });
    }
  }
  return { facts, messages, used };
}

/**
 * Run one Loki turn.
 *
 * `facts` accumulate across rounds and are re-rendered into the contract each
 * time, so the model always sees the CURRENT full record set with fresh
 * citation ids rather than a growing transcript of tool chatter.
 */
export async function runLokiTurn(input: {
  userId: string;
  message: string;
  voice?: string | null;
  registry?: ToolRegistry;
  /** Injected in tests; defaults to the real provider call. */
  callModel?: ModelCaller;
  /** Injected in tests so the loop can run with no DB. */
  seed?: { facts: Fact[]; directives: Directive[] };
}): Promise<LoopResult> {
  const registry = input.registry ?? (await defaultRegistry());
  const callModel = input.callModel ?? callModelWithTools;
  const names = toolNames(registry);
  const nativeTools = toOpenAITools(registry);
  const ctx = { userId: input.userId, message: input.message };

  // Seed. Named people first (the question is often about one of them),
  // then projects. The brief is only worth its tokens on planning questions.
  const seed = input.seed ?? (await defaultSeed(input.userId, input.message));
  const seedFacts = seed.facts;
  const directives = seed.directives;

  let facts: Fact[] = assignFactIds(seedFacts.slice(0, MAX_FACTS));
  const conversation: ChatMessage[] = [];
  const used: string[] = [];
  let text = "";
  let model = "";
  // Summed across every call this turn makes — rounds AND the repair pass.
  let usageTokens = 0;
  let rounds = 0;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    rounds = round + 1;
    const grounded = buildGroundedContext({ facts, directives, renderedFacts: renderFacts(facts) });
    const voiceLine = input.voice?.trim()
      ? `\n\nAdopt this writing voice: ${input.voice.trim()}`
      : "";

    // The last round must produce an answer, so stop advertising tools — a weak
    // model handed tools will keep calling them, and the operator would get a
    // dangling tool call instead of a reply.
    const lastRound = round === MAX_ROUNDS - 1;

    // Shed context rather than abandon the loop when the prompt is too big.
    //
    // Observed in production: the big model rate-limited, the 429 handler
    // stepped down to the 8B model as designed — and the 8B model then returned
    // 413, because a prompt sized for a 128k context does not fit a small one.
    // The loop gave up and fell back to a path with weaker retrieval, so the
    // step-down that was supposed to keep tools working achieved nothing.
    //
    // Facts are the elastic part (projects + accumulated tool results). Both
    // shedding policies live in fact-budget.ts — the invariant they encode is
    // that tool results (the facts the model just asked for) always survive.
    //
    // The ladder used to stop after two halvings, on the assumption that 40 → 20
    // → 10 facts fits every model in the chain. It does not: Groq's ceiling is
    // per-MINUTE tokens for the whole request (12000 on the 70B, 6000 on the 8B
    // step-down), and the fixed overhead — system prompt plus every tool's JSON
    // schema — is charged before a single fact. A turn that started too large
    // therefore ran out of attempts while still too large and abandoned the loop
    // on EVERY question. It halves further now, which is cheap because a size
    // 429 no longer costs a 25s wait per attempt (see groq-error.ts).
    // Everything charged besides facts. It GROWS as the loop proceeds — the
    // conversation carries each round's tool results — so the fit is recomputed
    // per round rather than once per turn.
    const overheadChars =
      systemPrompt(registry, !lastRound).length +
      voiceLine.length +
      input.message.length +
      (lastRound ? 0 : JSON.stringify(nativeTools).length) +
      conversation.reduce((n, m) => n + m.content.length, 0);
    // The notice is measured as part of the fit, not bolted on afterwards —
    // otherwise the very prompt that reports the shedding is what busts the
    // budget and triggers more of it.
    const withNotice = (f: Fact[]) =>
      [
        buildGroundedContext({ facts: f, directives, renderedFacts: renderFacts(f) }),
        omissionNotice(facts.length, f.length),
      ]
        .filter(Boolean)
        .join("\n\n---\n\n");
    const fitted = fitFactsToBudget(facts, withNotice, overheadChars, CALL_TOKEN_BUDGET);
    if (fitted.length < facts.length) {
      console.warn(
        `[loki] round ${rounds}: ${facts.length} facts exceed the call budget — sending ${fitted.length}`,
      );
    }

    const turn = await (async () => {
      let budget = fitted.length;
      for (let attempt = 0; ; attempt++) {
        const trimmed = budget >= fitted.length ? fitted : trimFactsToBudget(fitted, budget);
        const ctx =
          budget >= fitted.length && fitted.length === facts.length
            ? grounded
            : withNotice(trimmed);
        try {
          return await callModel({
            messages: [
              { role: "system", content: systemPrompt(registry, !lastRound) + voiceLine },
              { role: "user", content: `${ctx}\n\n---\n\n${input.message}` },
              ...conversation,
            ],
            tools: lastRound ? [] : nativeTools,
            validToolNames: lastRound ? [] : names,
          });
        } catch (e) {
          const tooLarge = /\b413\b|too large|context length|reduce the length/i.test(
            e instanceof Error ? e.message : String(e),
          );
          if (!tooLarge || attempt >= 5 || budget <= 4) throw e;
          budget = Math.max(4, Math.floor(budget / 2));
          console.warn(`[loki] prompt too large, retrying with ${budget} facts`);
        }
      }
    })();
    model = turn.model;
    usageTokens += turn.usageTokens;
    text = turn.text;

    if (turn.toolCalls.length === 0) break;

    const executed = await runToolCalls(turn.toolCalls, registry, ctx);
    used.push(...executed.used);
    if (executed.facts.length > 0) {
      facts = assignFactIds(mergeFactsWithCap(facts, executed.facts, MAX_FACTS));
    }
    conversation.push(
      {
        role: "assistant",
        content: turn.text || `(called ${executed.used.join(", ") || "tools"})`,
      },
      ...executed.messages,
    );
  }

  // Verify against everything gathered. Tool notes count as evidence — a note
  // saying "no contact matched Elena" legitimately licenses saying so.
  const evidence = [
    ...directives.flatMap((d) => [d.question, ...d.answer]),
    ...conversation.filter((m) => m.role === "user").map((m) => m.content),
  ];
  const citationIds = directives.map((_, i) => directiveId(i));
  let violations = facts.length
    ? verifyAnswer({
        answer: text,
        facts,
        userMessage: input.message,
        extraEvidence: evidence,
        extraCitationIds: citationIds,
      }).violations
    : [];

  if (violations.length > 0) {
    // Repair asks for DELETION, not regeneration — the model is not missing
    // knowledge, it added claims. Tools stay off so it cannot wander further.
    const repaired = await callModel({
      messages: [
        { role: "system", content: systemPrompt(registry, false) },
        {
          role: "user",
          content: [
            buildContract(facts, directives),
            "",
            renderFacts(facts),
            "",
            `The operator asked: ${input.message}`,
            "",
            `Your previous answer:\n${text}`,
            "",
            buildRepairPrompt(violations, NO_BASIS),
          ].join("\n"),
        },
      ],
      tools: [],
      validToolNames: [],
    }).catch(() => null);

    // Counted whether or not the repair is KEPT — the tokens were spent either
    // way, and a turn that quietly bills less than it drew would let the daily
    // pool drain faster than the ledger says.
    usageTokens += repaired?.usageTokens ?? 0;

    if (repaired?.text) {
      const second = verifyAnswer({
        answer: repaired.text,
        facts,
        userMessage: input.message,
        extraEvidence: evidence,
        extraCitationIds: citationIds,
      });
      // Keep the repair only if it actually improved things. A repair that
      // introduces MORE unsupported claims is a worse answer, and accepting it
      // unconditionally would let the safety pass degrade the turn.
      if (second.violations.length < violations.length) {
        text = repaired.text;
        violations = second.violations;
      }
    }
  }

  const sources: CitationSource[] = [
    ...facts.map((f) => ({
      id: f.id,
      label: f.subject,
      detail: [
        f.source,
        ...Object.entries(f.fields)
          .filter(([, v]) => v !== null)
          .map(([k, v]) => `${k}: ${v}`),
      ].join(" · "),
    })),
    ...directives.map((d, i) => ({
      id: directiveId(i),
      label: d.question,
      detail: [d.method, ...(d.answer.length ? d.answer : ["(none matched)"])].join(" · "),
    })),
  ];

  return { text, facts, sources, violations, toolsUsed: used, rounds, model, usageTokens };
}
