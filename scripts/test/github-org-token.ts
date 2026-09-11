/**
 * Pins which token an org-scoped GitHub write uses.
 * Run: npx tsx scripts/test/github-org-token.ts
 */
import { pickRepoWriteToken } from "@/lib/github-org-token";

const org = pickRepoWriteToken("org-tok", "user-tok");
if (!org || org.source !== "org" || org.token !== "org-tok") {
  throw new Error("a configured org token must win over the person's token");
}
const user = pickRepoWriteToken(null, "user-tok");
if (!user || user.source !== "user" || user.token !== "user-tok") {
  throw new Error("without an org token the person's token is used");
}
if (pickRepoWriteToken(null, null) !== null) throw new Error("no token → null, never a guess");
if (pickRepoWriteToken("", "user-tok")?.source !== "user") {
  throw new Error("an empty org token is no org token");
}
// The entitlement is the caller's job (getRepoWriteToken passes null for an
// account that may not use fleet infrastructure); this pins that passing null
// is exactly equivalent to having no server token at all.
if (pickRepoWriteToken(null, "user-tok")?.source !== "user") {
  throw new Error("an unentitled account falls back to its own token, never the org's");
}
if (pickRepoWriteToken(null, null) !== null) {
  throw new Error("an unentitled account with no token of its own gets nothing to write with");
}

console.log("✓ github org token");
