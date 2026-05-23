/**
 * Inline self-tests for db-url resolution.
 * Run: npm run test:db-url
 */
import { getDatabaseDirectUrl, getDatabasePoolUrl } from "@/lib/db-url";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function withEnv(
  vars: Record<string, string | undefined>,
  fn: () => void,
): void {
  const prior = new Map<string, string | undefined>();
  for (const key of Object.keys(vars)) {
    prior.set(key, process.env[key]);
    const value = vars[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const [key, value] of prior) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function runTests(): void {
  let passed = 0;
  const check = (label: string, fn: () => void) => {
    fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  };

  check("pool prefers DATABASE_POOL_URL", () => {
    withEnv(
      {
        DATABASE_POOL_URL: "postgres://pool",
        DATABASE_URL: "postgres://direct",
        NEON_DATABASE_URL: "postgres://legacy-pool",
      },
      () => assert(getDatabasePoolUrl() === "postgres://pool", "expected pool"),
    );
  });

  check("pool falls back to legacy NEON_DATABASE_URL", () => {
    withEnv(
      {
        DATABASE_POOL_URL: undefined,
        DATABASE_URL: "postgres://direct",
        NEON_DATABASE_URL: "postgres://legacy-pool",
      },
      () => assert(getDatabasePoolUrl() === "postgres://legacy-pool", "expected legacy pool"),
    );
  });

  check("pool falls back to DATABASE_URL for local dev", () => {
    withEnv(
      {
        DATABASE_POOL_URL: undefined,
        DATABASE_URL: "postgres://local",
        NEON_DATABASE_URL: undefined,
      },
      () => assert(getDatabasePoolUrl() === "postgres://local", "expected local"),
    );
  });

  check("direct prefers DATABASE_URL", () => {
    withEnv(
      {
        DATABASE_URL: "postgres://direct",
        NEON_DATABASE_URL_DIRECT: "postgres://legacy-direct",
      },
      () => assert(getDatabaseDirectUrl() === "postgres://direct", "expected direct"),
    );
  });

  check("direct does not fall back to pool URL", () => {
    withEnv(
      {
        DATABASE_URL: undefined,
        NEON_DATABASE_URL_DIRECT: undefined,
        DATABASE_POOL_URL: "postgres://pool-only",
        NEON_DATABASE_URL: "postgres://pool-only",
      },
      () => assert(getDatabaseDirectUrl() === undefined, "direct must stay undefined"),
    );
  });

  console.log(`\n${passed} passed`);
}

runTests();
