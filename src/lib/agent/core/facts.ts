/**
 * Facts — the unit of grounded context. MIRRORED MODULE (see core/README.md).
 *
 * The problem this solves, concretely. Loki was asked who to contact and
 * answered "Ilya Druzhnikov (UZH)". The stored record is:
 *
 *     { displayName: "Ilya Druzhnikov", channels: { whatsapp: "+1650…" } }
 *
 * There is no org field, and the string "UZH" appears nowhere in the operator's
 * data — it is the substring inside dr-UZH-nikov. A keyword match produced an
 * affiliation out of a surname, and prose context gave the model no way to tell
 * that "affiliation" was a field it had never been shown.
 *
 * The fix is representational, not a prompt instruction. A Fact is a RECORD with
 * a DECLARED field set, and every declared field is rendered — including the ones
 * with no value, which render as an explicit `<not recorded>`. A model that reads
 *
 *     affiliation: <not recorded>
 *
 * is being told a specific negative, which is far harder to overwrite than the
 * silence of a field that simply wasn't mentioned. Absence becomes evidence.
 *
 * Every fact also carries a short stable id ([F3]) so the answer can cite spans
 * and `verify.ts` can check citations mechanically rather than by vibes.
 *
 * Pure: no DB, no network, no framework. Apps map their rows into Facts via
 * their own adapters (FleetCrown: src/lib/agent/sources; OrangeCat: services/cat/sources).
 */

/** A field that is declared for a record kind but has no stored value. */
export const NOT_RECORDED = "<not recorded>";

/**
 * One grounded record. `fields` must contain an entry for EVERY key in the
 * kind's declared field list — `null` where nothing is stored. Builders should
 * go through `makeFact`, which enforces that against the registry.
 */
export type Fact = {
  /** Short citation handle, assigned by `assignFactIds` (F1, F2, …). */
  id: string;
  /** Record kind — must be a key of the FACT_KINDS registry. */
  kind: string;
  /** Human label for the record (a name, a title). Never invented. */
  subject: string;
  /** Declared field → stored value, or null for "nothing stored". */
  fields: Record<string, string | null>;
  /** Where this came from, shown to the model: "people table", "goals table". */
  source: string;
  /**
   * Relevance score when the fact came from similarity search. Absent for facts
   * fetched deterministically (a SQL filter) — those are not ranked, they are
   * simply true, and the distinction matters to the reader.
   */
  similarity?: number;
};

/**
 * The declared field set per record kind — the SSOT for "what could be known
 * about this kind of thing". Adding a field here makes it render as
 * `<not recorded>` everywhere it is missing, which is the entire anti-invention
 * mechanism: the model can only ever see fields we chose to declare.
 *
 * Deliberately includes fields we do NOT store (a person's `affiliation`,
 * `role`, `employer`). That is not an oversight — those are exactly the
 * attributes models invent, so naming them and marking them unrecorded is the
 * point. Do not "clean up" this list by deleting the empty ones.
 */
export const FACT_KINDS: Record<string, readonly string[]> = {
  person: ["name", "affiliation", "role", "how_we_met", "last_interaction", "notes", "channels"],
  project: ["name", "status", "stack", "description", "latest_dev_log", "repo"],
  goal: ["title", "project", "progress", "target_date", "last_updated"],
  habit: ["title", "frequency", "current_streak", "last_checked"],
  commitment: ["title", "due", "counterparty", "status"],
  event: ["name", "type", "deadline", "url", "status"],
  document: ["title", "source", "excerpt"],
};

/** Field list for a kind; unknown kinds fall back to whatever the fact carries. */
export function declaredFields(kind: string, fallback: string[] = []): readonly string[] {
  return FACT_KINDS[kind] ?? fallback;
}

/**
 * Build a Fact with every declared field present. Values not supplied become
 * null (→ `<not recorded>`). Undeclared keys are DROPPED rather than passed
 * through: if a field is worth showing the model it is worth declaring in
 * FACT_KINDS, otherwise the registry stops describing what the model sees.
 */
export function makeFact(input: {
  kind: string;
  subject: string;
  source: string;
  values?: Record<string, string | null | undefined>;
  similarity?: number;
}): Fact {
  const keys = declaredFields(input.kind, Object.keys(input.values ?? {}));
  const fields: Record<string, string | null> = {};
  for (const key of keys) {
    const raw = input.values?.[key];
    const trimmed = typeof raw === "string" ? raw.trim() : raw;
    fields[key] = trimmed ? String(trimmed) : null;
  }
  return {
    id: "",
    kind: input.kind,
    subject: input.subject,
    source: input.source,
    fields,
    ...(input.similarity !== undefined ? { similarity: input.similarity } : {}),
  };
}

/** Stamp sequential citation ids. Call once, after assembling the final set. */
export function assignFactIds(facts: Fact[]): Fact[] {
  return facts.map((f, i) => ({ ...f, id: `F${i + 1}` }));
}

/** Every citation handle in a fact set — the only legal citations in an answer. */
export function factIds(facts: Fact[]): Set<string> {
  return new Set(facts.map((f) => f.id));
}

/**
 * Render facts for the model. One block per record, every declared field on its
 * own line, unrecorded fields stated explicitly.
 *
 *   [F3] person — Elena Weber SINGA Switzerland  (people table)
 *        name: Elena Weber SINGA Switzerland
 *        affiliation: <not recorded>
 *        role: <not recorded>
 *        channels: whatsapp +41774730093
 *
 * The line-per-field shape matters for small models: a flat prose blob invites
 * summarising (and summarising is where invention creeps in), whereas a field
 * list invites lookup. Observed with 8B models — the same prompt over a blob
 * hallucinates roles, over a field list it reports `<not recorded>`.
 */
export function renderFacts(facts: Fact[]): string {
  if (facts.length === 0) return "";
  return facts
    .map((f) => {
      const head = `[${f.id}] ${f.kind} — ${f.subject}  (${f.source})`;
      const body = Object.entries(f.fields).map(
        ([k, v]) => `     ${k}: ${v ?? NOT_RECORDED}`,
      );
      return [head, ...body].join("\n");
    })
    .join("\n\n");
}

/**
 * Which declared fields are unrecorded across the set, as
 * `kind.field` keys. The contract block names these explicitly so the rule
 * "do not state an affiliation" is anchored to a concrete gap in THIS turn's
 * context rather than being a standing abstraction the model may ignore.
 */
export function unrecordedFields(facts: Fact[]): string[] {
  const gaps = new Set<string>();
  for (const f of facts) {
    for (const [k, v] of Object.entries(f.fields)) {
      if (v === null) gaps.add(`${f.kind}.${k}`);
    }
  }
  return [...gaps].sort();
}
