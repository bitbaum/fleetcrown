/**
 * Inline self-tests for onboarding helpers.
 * Run: npm run test:onboarding
 */
import {
  suggestUsername,
  hasValidUsername,
  isOnboardingComplete,
} from "@/lib/onboarding";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function runTests(): void {
  let passed = 0;
  const check = (label: string, fn: () => void) => {
    fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  };

  check("suggestUsername from display name", () => {
    assert(suggestUsername("Jane Doe", null) === "jane-doe", "expected jane-doe");
  });

  check("suggestUsername from email", () => {
    assert(suggestUsername(null, "builder@example.com") === "builder", "expected builder");
  });

  check("hasValidUsername rejects short handles", () => {
    assert(!hasValidUsername("a"), "single char invalid");
    assert(hasValidUsername("ab"), "two chars valid");
  });

  check("isOnboardingComplete requires username and timestamp", () => {
    assert(!isOnboardingComplete({ username: "you", onboardedAt: null }), "needs onboardedAt");
    assert(!isOnboardingComplete({ username: null, onboardedAt: new Date() }), "needs username");
    assert(isOnboardingComplete({ username: "you", onboardedAt: new Date() }), "complete");
  });

  console.log(`\n${passed}/${passed} passed`);
}

runTests();
