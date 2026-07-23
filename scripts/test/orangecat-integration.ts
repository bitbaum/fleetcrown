import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { verifyOrangeCatBuildIntent } from "../../src/lib/integrations/orangecat-build-intent";

const secret = "test-secret-that-is-at-least-thirty-two-characters";
process.env.FLEETCROWN_BUILD_INTENT_SECRET = secret;

function sign(overrides: Record<string, unknown> = {}): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: "orangecat",
    aud: "fleetcrown",
    sub: randomUUID(),
    jti: randomUUID(),
    iat: now,
    exp: now + 600,
    entity: {
      type: "group",
      id: randomUUID(),
      title: "Neighbourhood club",
      description: "A real place people want to open.",
      publicUrl: "https://www.orangecat.ch/groups/neighbourhood-club",
    },
    suggestedHandoff: ["Draft the owner-approved plan."],
    ...overrides,
  })).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

const valid = verifyOrangeCatBuildIntent(sign());
assert.equal(valid.iss, "orangecat");
assert.equal(valid.aud, "fleetcrown");
assert.equal(valid.exp - valid.iat, 600);

const signed = sign();
const [signedHeader, signedPayload, signedSignature] = signed.split(".");
const tamperedSignature =
  `${signedSignature[0] === "A" ? "B" : "A"}${signedSignature.slice(1)}`;
assert.throws(() =>
  verifyOrangeCatBuildIntent(`${signedHeader}.${signedPayload}.${tamperedSignature}`),
);
assert.throws(() => verifyOrangeCatBuildIntent(sign({ exp: 1 })));
assert.throws(() =>
  verifyOrangeCatBuildIntent(sign({
    entity: {
      type: "project",
      id: randomUUID(),
      title: "Wrong host",
      description: null,
      publicUrl: "https://example.com/projects/no",
    },
  })),
);
assert.throws(() =>
  verifyOrangeCatBuildIntent(sign({
    entity: {
      type: "project",
      id: randomUUID(),
      title: "Lookalike host",
      description: null,
      publicUrl: "https://evilorangecat.ch/projects/no",
    },
  })),
);

console.log("OrangeCat integration intent checks passed.");
