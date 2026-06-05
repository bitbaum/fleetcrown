/**
 * Inline self-tests for the heal decision logic.
 * Run: npm run test:onboarding-heal
 *
 * Covers the four branches of decideHealPatch — the pure, DB-free decision
 * extracted from healReturningUserOnboarding so it's testable without spinning
 * up Postgres. The throw-safety of the surrounding wrapper is verified by
 * inspection (try/catch around every await — see onboarding-heal.ts).
 */
import { decideHealPatch } from "@/lib/onboarding-heal-decision";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const newUser = {
  name: "Jane Doe",
  email: "jane@example.com",
  username: null,
  onboardedAt: null,
} as const;

function runTests(): void {
  let passed = 0;
  const check = (label: string, fn: () => void) => {
    fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  };

  check("brand-new user + free suggested username → auto-heal (sets both)", () => {
    const patch = decideHealPatch(newUser, 0, true);
    assert(patch !== null, "expected auto-heal patch on first sign-in");
    assert(patch!.username === "jane-doe", `expected jane-doe, got ${patch!.username}`);
    assert(patch!.onboardedAt instanceof Date, "expected onboardedAt date");
  });

  check("brand-new user + suggested username taken → no heal (manual /onboarding fallback)", () => {
    const patch = decideHealPatch(newUser, 0, false);
    assert(patch === null, "expected null patch when no username can be derived");
  });

  check("returning user with projects + no username + suggestion free → patch sets both", () => {
    const patch = decideHealPatch(newUser, 3, true);
    assert(patch !== null, "expected patch");
    assert(patch!.username === "jane-doe", `expected jane-doe, got ${patch!.username}`);
    assert(patch!.onboardedAt instanceof Date, "expected onboardedAt date");
  });

  check("returning user with projects + suggested username taken → no heal (avoid wasted write)", () => {
    // Without a valid username, setting onboardedAt is a no-op because
    // isOnboardingComplete still gates on hasValidUsername. Skip the write
    // and let the user fall through to /onboarding to pick manually.
    const patch = decideHealPatch(newUser, 3, false);
    assert(patch === null, "expected null patch — no username, no point setting onboardedAt");
  });

  check("already-onboarded user with valid username → no heal needed", () => {
    const patch = decideHealPatch(
      { name: "Jane Doe", email: "jane@example.com", username: "jane-doe", onboardedAt: new Date() },
      5,
      true,
    );
    assert(patch === null, "expected null patch when user is fully set up");
  });

  check("user with onboardedAt but no username (legacy migrated row) → patch sets username only", () => {
    const patch = decideHealPatch(
      { name: "Jane Doe", email: "jane@example.com", username: null, onboardedAt: new Date("2025-01-01") },
      0,
      true,
    );
    assert(patch !== null, "expected patch");
    assert(patch!.username === "jane-doe", `expected jane-doe, got ${patch!.username}`);
    assert(patch!.onboardedAt === undefined, "expected no onboardedAt when already set");
  });

  check("zero projects + onboardedAt set → still treated as returning", () => {
    const patch = decideHealPatch(
      { name: "Jane Doe", email: "jane@example.com", username: null, onboardedAt: new Date() },
      0,
      true,
    );
    assert(patch !== null, "onboardedAt alone should mark user as returning");
  });

  console.log(`\n${passed}/${passed} passed`);
}

runTests();
