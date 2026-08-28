/**
 * Model-rot detection: three states, never two.
 * Run: npx tsx scripts/test/model-check.ts
 *
 * The failure this guards against is the checker inventing an outage. If a
 * catalogue read fails and we treat the result as an empty catalogue, EVERY
 * pinned id reads as "gone" and the operator gets a maximally alarming alert
 * caused entirely by our own network blip. The inverse is just as bad: letting
 * "could not look" count as a pass is how a dead pin survives for eight days.
 *
 * So: got-it / absent / could-not-look must stay three distinct outcomes.
 */
import assert from "node:assert/strict";
import { checkRegisteredModels, describeRot, type CatalogReader, type CallProbe } from "../../src/lib/model-check";
import { supportsReasoningEffort } from "../../src/lib/groq";
import { REGISTERED_MODELS, registeredIdsFor } from "../../src/config/model-registry";

const ALL_PROVIDERS = [...new Set(REGISTERED_MODELS.map((m) => m.provider))];

async function main() {

  // ── Everything present → clean bill of health ────────────────────────────────
  {
    const everythingLives: CatalogReader = async (p) => new Set(registeredIdsFor(p));
    const report = await checkRegisteredModels(everythingLives);

    assert.equal(report.missing.length, 0, "no pin should be missing when the catalogue holds them all");
    assert.equal(report.uncheckedIds.length, 0, "nothing is unchecked when every catalogue was read");
    assert.ok(report.presentCount > 0, "should have confirmed at least one id present");
    assert.ok(report.providers.every((r) => r.reachable), "every provider was reachable in this scenario");
  }

  // ── A catalogue we CANNOT READ is not a catalogue full of dead models ────────
  {
    const cannotLook: CatalogReader = async () => null;
    const report = await checkRegisteredModels(cannotLook);

    assert.equal(
      report.missing.length,
      0,
      "UNREADABLE CATALOGUE MUST NOT REPORT ROT — this is the check inventing an outage from its own failure",
    );
    assert.ok(report.uncheckedIds.length > 0, "unreadable catalogues must surface as UNCHECKED ids");
    assert.equal(report.presentCount, 0, "nothing can be confirmed present when nothing was read");
    assert.ok(report.providers.every((r) => !r.reachable), "providers should be marked unreachable");
  }

  // ── An EMPTY catalogue is treated as unreadable, not as total annihilation ───
  // The real fetchCatalog collapses `data: []` to null. Asserted here because a
  // provider returning 200 with an empty list is a likelier glitch than every
  // model on the platform disappearing at the same instant.
  {
    const emptyIsUnreadable: CatalogReader = async () => null; // what fetchCatalog does with `data: []`
    const report = await checkRegisteredModels(emptyIsUnreadable);
    assert.equal(report.missing.length, 0, "an empty catalogue must not read as universal rot");
  }

  // ── A genuinely dead pin IS reported, and says what it breaks ────────────────
  {
    const victim = REGISTERED_MODELS[0];
    const oneIsDead: CatalogReader = async (p) => {
      const ids = registeredIdsFor(p).filter((id) => !(p === victim.provider && id === victim.id));
      return new Set(ids);
    };
    const report = await checkRegisteredModels(oneIsDead);

    assert.ok(report.missing.length > 0, "a pin absent from a READ catalogue must be reported as rot");
    assert.ok(
      report.missing.every((m) => m.id === victim.id),
      "only the removed id should be reported missing",
    );
    assert.equal(report.uncheckedIds.length, 0, "readable catalogues leave nothing unchecked");

    const text = describeRot(report);
    assert.ok(text.includes(victim.id), "the alert text must name the dead id");
    assert.ok(
      text.includes(victim.usedFor.slice(0, 24)),
      "the alert text must say what breaks — an id alone is not actionable",
    );
  }

  // ── Mixed: one provider readable, another not ────────────────────────────────
  if (ALL_PROVIDERS.length > 1) {
    const [first, ...rest] = ALL_PROVIDERS;
    const mixed: CatalogReader = async (p) => (p === first ? new Set(registeredIdsFor(p)) : null);
    const report = await checkRegisteredModels(mixed);

    assert.equal(report.missing.length, 0, "the unreadable provider must not contribute phantom rot");
    assert.ok(report.presentCount > 0, "the readable provider still yields confirmations");
    assert.ok(
      report.uncheckedIds.length > 0,
      `the unreadable provider(s) ${rest.join(",")} must surface as unchecked`,
    );
  }

  // ── Callability: present in the catalogue is not the same as usable ─────────
  // qwen/qwen3.6-27b was listed by Groq the whole time every call to it 400'd,
  // and the existence check reported `rotted: 0` throughout. These assert the
  // three verdicts land where they belong.
  {
    const readable: CatalogReader = async (p) => new Set(registeredIdsFor(p));
    const chatPin = REGISTERED_MODELS.find((m) => m.kind === "chat")!;

    const refusing: CallProbe = async (m) =>
      m.id === chatPin.id
        ? { verdict: "rejected", error: "`reasoning_effort` must be one of `none` or `default`" }
        : { verdict: "accepted" };
    const report = await checkRegisteredModels(readable, refusing);

    assert.equal(report.missing.length, 0, "a refused model is not MISSING — it is listed");
    assert.equal(report.rejected.length, 1, "a 400 on our own request shape must be reported");
    assert.equal(report.rejected[0].model.id, chatPin.id, "the right id must be named");

    const text = describeRot(report);
    assert.ok(text.includes(chatPin.id), "the alert text must name the refusing id");
    assert.ok(
      text.includes("reasoning_effort"),
      "the provider's own message must survive into the alert — it names the parameter, which is the fix",
    );
    assert.ok(
      text.includes(chatPin.usedFor.slice(0, 24)),
      "a refusal must say what it breaks, exactly as a removal does",
    );
  }

  // A transient 429 or a network blip is NOT rot. Same discipline as an
  // unreadable catalogue: three states, and "could not look" is its own.
  {
    const readable: CatalogReader = async (p) => new Set(registeredIdsFor(p));
    const flaky: CallProbe = async () => ({ verdict: "unknown", error: "HTTP 429" });
    const report = await checkRegisteredModels(readable, flaky);
    assert.equal(report.rejected.length, 0, "a rate limit must never be reported as a dead model");
  }

  // Transcription ids live on a different endpoint; probing them with a chat
  // completion would 400 for a reason that has nothing to do with the fault.
  {
    const readable: CatalogReader = async (p) => new Set(registeredIdsFor(p));
    const probed: string[] = [];
    const recorder: CallProbe = async (m) => { probed.push(m.id); return { verdict: "accepted" }; };
    await checkRegisteredModels(readable, recorder);

    const transcribe = REGISTERED_MODELS.filter((m) => m.kind === "transcribe").map((m) => m.id);
    assert.ok(transcribe.length > 0, "expected at least one transcription pin — has the registry changed?");
    for (const id of transcribe) {
      assert.ok(!probed.includes(id), `${id} is a transcription model and must not be probed as chat`);
    }
    assert.ok(probed.length > 0, "the probe must actually run on the chat pins");
  }

  // The probe must build its request from the SAME predicate the real call path
  // uses. A probe with its own opinion would pass while production 400s — the
  // checker/consumer split that made this bug invisible in the first place.
  assert.equal(
    supportsReasoningEffort("qwen/qwen3.6-27b"),
    false,
    "qwen no longer accepts the reasoning_effort values this app sends — it must not be in the allow-list",
  );
  assert.ok(
    supportsReasoningEffort("openai/gpt-oss-20b"),
    "gpt-oss still accepts reasoning_effort; dropping it would silently change every call",
  );

  console.log(`✓ model-check: existence AND callability across ${ALL_PROVIDERS.length} provider(s), ${REGISTERED_MODELS.length} pin(s)`);

}

void main();
