/**
 * Inline self-test: the shell-side brand mirror (scripts/_brand.sh) must not
 * drift from the canonical TypeScript SSOT (src/config/brand.ts).
 *
 * Ground Truth #2: if the brand lives in two places, they will eventually
 * disagree. brand.ts only *asks* shell to stay in sync — this test enforces it,
 * turning the mirror into a safe rebrand lever instead of a future bug.
 *
 * Run: npm run test:brand-sync
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { APP_NAME, APP_SLUG, APP_DOMAIN, BRIDGE_DOMAIN } from "@/config/brand";
import { DRAFT_STORAGE_PREFIX, PRIVATE_ZONE_COOKIE } from "@/config/brand-storage";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const here = dirname(fileURLToPath(import.meta.url));
const shellPath = resolve(here, "../_brand.sh");
const shell = readFileSync(shellPath, "utf8");

/** Pull a `NAME="value"` assignment out of the shell mirror. */
function shellVar(name: string): string {
  const match = shell.match(new RegExp(`^${name}="([^"]*)"`, "m"));
  if (!match) throw new Error(`scripts/_brand.sh is missing ${name}=`);
  return match[1];
}

function runTests(): void {
  let passed = 0;
  const check = (label: string, fn: () => void) => {
    fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  };

  const pairs: Array<[string, string]> = [
    ["APP_NAME", APP_NAME],
    ["APP_SLUG", APP_SLUG],
    ["APP_DOMAIN", APP_DOMAIN],
    ["BRIDGE_DOMAIN", BRIDGE_DOMAIN],
  ];

  for (const [name, tsValue] of pairs) {
    check(`${name} matches brand.ts (${tsValue})`, () => {
      const shellValue = shellVar(name);
      assert(
        shellValue === tsValue,
        `${name} drift: brand.ts="${tsValue}" but _brand.sh="${shellValue}"`,
      );
    });
  }

  // Derived URLs in the shell mirror must be built from the mirrored domains,
  // not hardcoded independently.
  check("APP_URL derives from APP_DOMAIN", () => {
    assert(
      /^APP_URL="https:\/\/\$\{APP_DOMAIN\}"/m.test(shell),
      "_brand.sh APP_URL must be https://${APP_DOMAIN}",
    );
  });
  check("BRIDGE_URL derives from BRIDGE_DOMAIN", () => {
    assert(
      /^BRIDGE_URL="https:\/\/\$\{BRIDGE_DOMAIN\}\/sse"/m.test(shell),
      "_brand.sh BRIDGE_URL must be https://${BRIDGE_DOMAIN}/sse",
    );
  });

  check("storage keys derive from APP_SLUG", () => {
    assert(PRIVATE_ZONE_COOKIE === `${APP_SLUG}-pz`, "private zone cookie drift");
    assert(DRAFT_STORAGE_PREFIX === `${APP_SLUG}:draft:`, "draft prefix drift");
  });

  console.log(`\n${passed} brand-sync assertions passed.`);
}

runTests();
