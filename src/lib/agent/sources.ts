/**
 * FleetCrown → Fact adapters. The app-bound half of the harness: everything
 * here knows about Drizzle and FleetCrown's schema; nothing in core/ does.
 *
 * The rule these encode: a Fact may only carry values that were STORED. Nothing
 * here derives, guesses, or enriches. Where FleetCrown has no value for a
 * declared field, the field stays null and renders as `<not recorded>` — which
 * is the whole mechanism, so resist the urge to be helpful by inferring an
 * affiliation from a name, a role from a description, or a status from silence.
 */
import { fetchOpenDemand, searchEconomy } from "@/lib/integrations/orangecat-demand";
import { searchPeople, type PersonWithAttributes } from "@/db/queries/people";
import { getUserProjects } from "@/db/queries/user-projects";
import { getPendingActions } from "@/db/queries/actions";
import { searchKnowledge, type KnowledgeHit } from "@/db/queries/knowledge-embeddings";
import { embeddingsEnabled } from "@/lib/rag/embeddings";
import { cleanDescription } from "@/lib/project-display";
import { makeFact, type Fact } from "@/lib/agent/core/facts";
import { isChannelAttrKey, stripChannelPrefix } from "@/config/channels";
import { nameCandidates } from "@/lib/people-names";
import type { DevLogEntry, UserProject } from "@/db/schema/user-projects";

const PEOPLE_LIMIT = 12;
const PROJECT_LIMIT = 40;
const DOC_CHUNK_MAX = 400;

/**
 * Date rendered for a fact value: calendar day, no time, no locale guessing.
 * A fact carries what was stored, and a timestamp's clock component is noise
 * the model will otherwise try to reason about.
 */
export function dateLabel(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/**
 * Attribute keys that map onto a declared `person` field. Anything not listed
 * is folded into `notes` rather than dropped, so a stored fact is never
 * invisible — but it also never silently becomes an "affiliation".
 *
 * `affiliation` and `role` are present here so that IF the operator ever
 * records them they are used. Today they almost never are, which is exactly
 * why the model kept inventing them.
 */
const PERSON_ATTR_MAP: Record<string, string> = {
  affiliation: "affiliation",
  org: "affiliation",
  organisation: "affiliation",
  organization: "affiliation",
  company: "affiliation",
  employer: "affiliation",
  role: "role",
  title: "role",
  job: "role",
  profession: "role",
  relationship: "how_we_met",
  met: "how_we_met",
  how_we_met: "how_we_met",
  context: "how_we_met",
};

function personToFact(p: PersonWithAttributes): Fact {
  const values: Record<string, string | null> = {
    name: p.name,
    affiliation: null,
    role: null,
    how_we_met: null,
    last_interaction: dateLabel(p.lastInteraction),
    notes: p.description,
    channels: null,
  };

  const channels: string[] = [];
  const leftovers: string[] = [];

  for (const [rawKey, rawVal] of Object.entries(p.attrs ?? {})) {
    const key = rawKey.toLowerCase().trim();
    const val = String(rawVal ?? "").trim();
    if (!val) continue;
    if (isChannelAttrKey(key) || key === "phone" || key === "mobile" || key === "email") {
      channels.push(`${stripChannelPrefix(key)} ${val.replace(/^e164:/, "")}`);
      continue;
    }
    const mapped = PERSON_ATTR_MAP[key];
    if (mapped) {
      values[mapped] = val;
      continue;
    }
    leftovers.push(`${rawKey}: ${val}`);
  }

  if (channels.length > 0) values.channels = channels.join(", ");
  if (leftovers.length > 0) {
    values.notes = [values.notes, leftovers.join("; ")].filter(Boolean).join(" · ");
  }

  return makeFact({ kind: "person", subject: p.name, source: "people table", values });
}

/**
 * People facts for a turn.
 *
 * Retrieval is by name substring (`searchPeople`) when the query names someone,
 * and otherwise by recency of interaction. Substring matching is acceptable
 * HERE, on the `name` column, because the match is used only to SELECT a
 * record — every field the model then sees is the record's own stored value.
 * The original bug was not substring search per se; it was substring search
 * over an untyped blob whose incidental matches (`dr-UZH-nikov`) were then
 * narrated as attributes.
 */
export async function peopleFacts(userId: string, query: string): Promise<Fact[]> {
  const candidates = nameCandidates(query);

  // Search each candidate name separately and union the results. Passing the
  // WHOLE message was the original bug: searchPeople filters with
  // `name ILIKE '%q%'`, so a sentence can never match a name column, every
  // lookup silently fell through to "12 most recent contacts", and Loki then
  // correctly reported "Not in your data" about someone who was in the table.
  // A grounded assistant that cannot find real records is not safer than one
  // that invents them — it is just differently useless.
  const seen = new Set<string>();
  const found: PersonWithAttributes[] = [];
  for (const name of candidates) {
    if (found.length >= PEOPLE_LIMIT) break;
    const hit = await searchPeople(userId, name, PEOPLE_LIMIT).catch(() => null);
    for (const p of hit?.people ?? []) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      found.push(p);
    }
  }
  if (found.length > 0) return found.slice(0, PEOPLE_LIMIT).map(personToFact);

  // Nothing named (or nothing matched) — fall back to recent interactions so a
  // question like "who should I reach out to" still has something to work with.
  const recent = await searchPeople(userId, "", PEOPLE_LIMIT).catch(() => null);
  return (recent?.people ?? []).map(personToFact);
}

function latestDevLog(project: UserProject): string | null {
  const log = (project.devLog as DevLogEntry[]) ?? [];
  const last = log[log.length - 1];
  if (!last?.done) return null;
  return `${last.date ? `${last.date}: ` : ""}${last.done}`.replace(/\s+/g, " ").trim();
}

/** Every registered project — breadth, so "across all my projects" is answerable. */
export async function projectFacts(userId: string): Promise<Fact[]> {
  const projects = await getUserProjects(userId).catch(() => [] as UserProject[]);
  return projects.slice(0, PROJECT_LIMIT).map((p) =>
    makeFact({
      kind: "project",
      subject: p.name,
      source: "projects table",
      values: {
        name: p.name,
        // There is no free-text status column — `is_active` is the only stored
        // signal, so that is exactly what the model is told. Anything richer
        // ("blocked", "shipping") would be a value nobody entered.
        status: p.isActive ? "active" : "inactive",
        stack: p.stack,
        description: cleanDescription(p.description),
        latest_dev_log: latestDevLog(p),
        repo: p.gitUrl,
      },
    }),
  );
}

/**
 * The operator's approval queue — draft actions waiting on an approve/reject.
 *
 * Lives here, not only behind a tool, because a tool call requires a healthy
 * model AND spare rate limit, and this question must survive losing both. When
 * Groq's org-wide TPM window is exhausted the tool loop dies entirely and Loki
 * answers from the seed context on a toolless fallback model — at which point a
 * queue reachable only by tool call is invisible, and "what's pending for
 * approval?" gets the honest, useless answer "Not in your data." That is exactly
 * what production served (2026-08-14). The approval queue is the governance
 * surface FleetCrown exists to provide, so it is seeded like projects are.
 */
export async function pendingApprovalFacts(userId: string, limit: number): Promise<Fact[]> {
  const rows = await getPendingActions(userId).catch(() => []);
  return rows.slice(0, limit).map((a) =>
    makeFact({
      kind: "pending_action",
      subject: a.title,
      source: "approval queue (actions table, status=draft)",
      values: {
        title: a.title,
        type: a.type,
        reasoning: a.reasoning,
        proposed_on: dateLabel(a.createdAt),
        // The short prefix is what the operator can quote to decide it from
        // chat (fc.sh decide <prefix>) — the full uuid is noise to a human.
        id: a.id.slice(0, 8),
      },
    }),
  );
}

/**
 * Semantic depth from the pgvector knowledge index.
 *
 * Note these come back as `document` facts carrying a similarity score, NOT as
 * facts about the entity they mention. A retrieved dev-log chunk is evidence
 * that a sentence was written, which is a weaker claim than the sentence being
 * currently true — and collapsing that distinction is how stale notes get
 * reported as present state.
 */
export async function documentFacts(userId: string, query: string, k: number): Promise<Fact[]> {
  if (!embeddingsEnabled() || !query.trim()) return [];
  const hits: KnowledgeHit[] = await searchKnowledge(userId, query, { k }).catch(() => []);
  return hits.map((h) => {
    const project = (h.metadata?.project as string | undefined) ?? "";
    const title = (h.metadata?.title as string | undefined) ?? "";
    return makeFact({
      kind: "document",
      subject: title || project || h.sourceId,
      source: `${h.sourceType}${project ? ` · ${project}` : ""} (retrieved, similarity ${h.similarity.toFixed(2)})`,
      similarity: h.similarity,
      values: {
        title: title || project || h.sourceId,
        source: h.sourceType,
        excerpt: h.chunk.replace(/\s+/g, " ").slice(0, DOC_CHUNK_MAX),
      },
    });
  });
}

/**
 * Live economy signal from OrangeCat — open needs and matching listings. This
 * is what the fleet could BUILD FOR, and it is the one source here that is not
 * the operator's own data, so its facts are labelled with their external origin
 * ("orangecat.ch") to keep that distinction visible in the answer.
 *
 * Best-effort: a slow or down OrangeCat contributes no facts, never a failed turn.
 */
export async function economyFacts(query: string, limit: number): Promise<Fact[]> {
  const [demand, matches] = await Promise.all([
    fetchOpenDemand().catch(() => null),
    query.trim() ? searchEconomy(query).catch(() => []) : Promise.resolve([]),
  ]);

  const needFacts = (demand?.needs ?? []).slice(0, limit).map((n) =>
    makeFact({
      kind: "document",
      subject: n.title,
      source: "orangecat.ch · open demand",
      values: { title: n.title, source: "orangecat open demand", excerpt: n.text.replace(/\s+/g, " ").slice(0, DOC_CHUNK_MAX) },
    }),
  );

  const matchFacts = matches.slice(0, limit).map((m) =>
    makeFact({
      kind: "document",
      subject: m.title,
      source: `orangecat.ch · ${m.type}`,
      ...(m.similarity !== undefined ? { similarity: m.similarity } : {}),
      values: { title: m.title, source: `orangecat ${m.type}`, excerpt: m.description.replace(/\s+/g, " ").slice(0, DOC_CHUNK_MAX) },
    }),
  );

  return [...needFacts, ...matchFacts];
}
