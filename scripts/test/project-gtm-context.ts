// Distribution + go-to-market are first-class agent context: present in the
// attr SSOT, rendered into the dossier Profile, listed in the fallback
// DRIVING_FIELDS, and extractable by the brief pipeline. This test pins the
// whole chain so neither field can silently fall out of any link.
// Run: npx tsx scripts/test/project-gtm-context.ts

// The @/db module throws at import when no URL is configured; nothing here
// ever queries, so a placeholder keeps this test environment-independent.
process.env.DATABASE_URL ??= "postgres://unit:unit@localhost:5432/unit";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error(`✗ ${label}`);
  }
}

async function main() {
  const { PROJECT_ATTR } = await import("@/config/project-attrs");
  const { DRIVING_FIELDS } = await import("@/db/queries/project-context");
  const { renderProjectDossierForAgent } = await import("@/db/queries/project-dossier");
  const { ExtractedProfileSchema } = await import("@/lib/project-brief");
  type ProjectDossier = import("@/db/queries/project-dossier").ProjectDossier;

  // ── The keys exist in the SSOT ────────────────────────────────────────────
  ok(PROJECT_ATTR.DISTRIBUTION === "distribution", "PROJECT_ATTR.DISTRIBUTION is 'distribution'");
  ok(PROJECT_ATTR.GTM === "gtm", "PROJECT_ATTR.GTM is 'gtm'");

  // ── Fallback dispatch context includes both ───────────────────────────────
  const drivingKeys = DRIVING_FIELDS.map(([key]) => key);
  ok(drivingKeys.includes(PROJECT_ATTR.DISTRIBUTION), "DRIVING_FIELDS carries distribution");
  ok(drivingKeys.includes(PROJECT_ATTR.GTM), "DRIVING_FIELDS carries gtm");

  // ── Dossier Profile renders both, labeled for the agent ──────────────────
  function dossier(attrs: Record<string, string>): ProjectDossier {
    return {
      detail: {
        project: { name: "HamsterCheek", description: "A box you hide outside." },
        attrs,
        linkedGoals: [],
        devLog: [],
        resources: [],
      },
      ownerId: "u",
      readonly: false,
      state: null,
      activity: [],
      runs: [],
      outcomes: [],
      userProject: null,
      orangecatLinks: [],
      orangecatFunding: null,
      commits: null,
      builtAtMs: Date.now(),
    } as unknown as ProjectDossier;
  }

  const rendered = renderProjectDossierForAgent(
    dossier({
      mission: "Keep valuables out of the house",
      distribution: "RSS + newsletter, OG cards on every share page",
      gtm: "ICP: solo builders; first paying customer via OrangeCat top-ups",
    }),
  );
  ok(/- Distribution: RSS \+ newsletter/.test(rendered), "dossier renders '- Distribution: …'");
  ok(/- Go-to-market: ICP: solo builders/.test(rendered), "dossier renders '- Go-to-market: …'");
  ok(
    rendered.indexOf("## Profile") < rendered.indexOf("- Distribution:"),
    "both live in the Profile section",
  );

  // ── The 9000-char prompt cap survives the new fields ─────────────────────
  const huge = renderProjectDossierForAgent(dossier({ gtm: "x".repeat(20_000) }));
  ok(huge.length <= 9000, `dossier stays capped at 9000 chars (got ${huge.length})`);

  // ── Brief extraction accepts both, at the same 500-char limit ────────────
  ok(
    ExtractedProfileSchema.safeParse({ distribution: "RSS", gtm: "Solo builders" }).success,
    "ExtractedProfileSchema accepts distribution + gtm",
  );
  ok(
    !ExtractedProfileSchema.safeParse({ distribution: "x".repeat(501) }).success,
    "a 501-char distribution is rejected (FIELD_LIMIT holds)",
  );

  console.log(`${fail === 0 ? "✓" : "✗"} project-gtm-context: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
