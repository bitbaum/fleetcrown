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
import { buildGroundedContext, buildContract, NO_BASIS, type Directive } from "@/lib/agent/core/contract";
import { verifyAnswer, buildRepairPrompt, type Violation } from "@/lib/agent/core/verify";
import { callModelWithTools, type ChatMessage, type ToolCall } from "@/lib/agent/llm";
import { renderToolCatalog, toOpenAITools, toolNames, type ToolRegistry } from "@/lib/agent/tools/registry";
import { APP_NAME } from "@/config/brand";

// The concrete registry and the seed fetchers reach the database, and @/db
// throws at MODULE INIT when no connection string is set. Importing them lazily
// keeps this module pure to load: a caller that supplies its own registry and
// seed (the unit suite) never touches the database at all, and the production
// path pays one dynamic import per turn — noise next to a model round trip.
async function defaultRegistry(): Promise<ToolRegistry> {
  return (await import("@/lib/agent/tools/handlers")).LOKI_TOOLS;
}

async function defaultSeed(userId: string, message: string): Promise<{ facts: Fact[]; directives: Directive[] }> {
  const [{ projectFacts }, { buildDailyBrief }] = await Promise.all([
    import("@/lib/agent/sources"),
    import("@/lib/agent/brief"),
  ]);
  const [facts, directives] = await Promise.all([
    projectFacts(userId).catch(() => [] as Fact[]),
    PLANNING_CUES.test(message) ? buildDailyBrief(userId).catch(() => [] as Directive[]) : Promise.resolve([] as Directive[]),
  ]);
  return { facts, directives };
}

/** Model turns per request. 3 covers plan→gather→answer; more is usually a loop. */
const MAX_ROUNDS = 3;
/** Tool executions per round — enough to fan out, few enough to stay fast. */
const MAX_CALLS_PER_ROUND = 4;
/** Total facts carried. Past this, small models answer about the wrong record. */
const MAX_FACTS = 40;

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

export type LoopResult = {
  text: string;
  facts: Fact[];
  violations: Violation[];
  /** Tool names actually executed, in order — surfaced so the UI can show work. */
  toolsUsed: string[];
  rounds: number;
  model: string;
};

function systemPrompt(registry: ToolRegistry): string {
  return [
    `You are Loki, the assistant inside ${APP_NAME} — the captain's layer over the operator's fleet of projects and agents.`,
    "",
    "## How you work",
    "You answer from the operator's own FleetCrown database, which you read through tools. You do not know anything about the operator that a tool has not returned.",
    "",
    "Call a tool by writing these two lines in your reply, exactly like this:",
    "",
    "TOOL: search_people",
    'ARGS: {"query": "Elena"}',
    "",
    "Write nothing else in a reply that calls tools — you will be given the results and asked again. You may call several tools at once by repeating the two lines.",
    "",
    "## What you cannot do",
    `You have NO power to act. You cannot send a message, write to the calendar, or change anything. Your only lever is the ${APP_NAME} approval queue via propose_action, and the operator must approve each draft before anything happens. Never report an action as done. Never claim a sandbox or permission blocked you.`,
    "You have not browsed the web. If asked to research a person or company, say you cannot, and report only what the tools returned.",
    "",
    "## Tools",
    renderToolCatalog(registry),
    "",
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
      messages.push({ role: "user", content: `[tool ${call.name}] no such tool. Available: ${toolNames(registry).join(", ")}` });
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

  // Seed. Projects are cheap and almost always relevant; the brief is only
  // worth its tokens on planning questions.
  const seed = input.seed ?? (await defaultSeed(input.userId, input.message));
  const seedFacts = seed.facts;
  const directives = seed.directives;

  let facts: Fact[] = assignFactIds(seedFacts.slice(0, MAX_FACTS));
  const conversation: ChatMessage[] = [];
  const used: string[] = [];
  let text = "";
  let model = "";
  let rounds = 0;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    rounds = round + 1;
    const grounded = buildGroundedContext({ facts, directives, renderedFacts: renderFacts(facts) });
    const voiceLine = input.voice?.trim() ? `\n\nAdopt this writing voice: ${input.voice.trim()}` : "";

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt(registry) + voiceLine },
      { role: "user", content: `${grounded}\n\n---\n\n${input.message}` },
      ...conversation,
    ];

    // The last round must produce an answer, so stop advertising tools — a weak
    // model handed tools will keep calling them, and the operator would get a
    // dangling tool call instead of a reply.
    const lastRound = round === MAX_ROUNDS - 1;
    const turn = await callModel({
      messages,
      tools: lastRound ? [] : nativeTools,
      validToolNames: lastRound ? [] : names,
    });
    model = turn.model;
    text = turn.text;

    if (turn.toolCalls.length === 0) break;

    const executed = await runToolCalls(turn.toolCalls, registry, ctx);
    used.push(...executed.used);
    if (executed.facts.length > 0) {
      facts = assignFactIds([...facts, ...executed.facts].slice(0, MAX_FACTS));
    }
    conversation.push(
      { role: "assistant", content: turn.text || `(called ${executed.used.join(", ") || "tools"})` },
      ...executed.messages,
    );
  }

  // Verify against everything gathered. Tool notes count as evidence — a note
  // saying "no contact matched Elena" legitimately licenses saying so.
  const evidence = [
    ...directives.flatMap((d) => [d.question, ...d.answer]),
    ...conversation.filter((m) => m.role === "user").map((m) => m.content),
  ];
  let violations = facts.length
    ? verifyAnswer({ answer: text, facts, userMessage: input.message, extraEvidence: evidence }).violations
    : [];

  if (violations.length > 0) {
    // Repair asks for DELETION, not regeneration — the model is not missing
    // knowledge, it added claims. Tools stay off so it cannot wander further.
    const repaired = await callModel({
      messages: [
        { role: "system", content: systemPrompt(registry) },
        {
          role: "user",
          content: [
            buildContract(facts),
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

    if (repaired?.text) {
      const second = verifyAnswer({ answer: repaired.text, facts, userMessage: input.message, extraEvidence: evidence });
      // Keep the repair only if it actually improved things. A repair that
      // introduces MORE unsupported claims is a worse answer, and accepting it
      // unconditionally would let the safety pass degrade the turn.
      if (second.violations.length < violations.length) {
        text = repaired.text;
        violations = second.violations;
      }
    }
  }

  return { text, facts, violations, toolsUsed: used, rounds, model };
}
