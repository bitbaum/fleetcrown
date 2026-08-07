/**
 * Cast Loki's Bitcoin-signed vote on a Solon session — from this box, with
 * this system's own key. A vote cast here is FleetCrown's attested judgment;
 * the private key never leaves the environment.
 *
 * v1 casts are operator-run. A future autonomous path stays behind the
 * approval queue (no auto-approve, ever) and reuses this as its `executed`
 * step — nothing here is throwaway.
 *
 * Usage (on the box, where LOKI_SOLON_PRIVKEY is set):
 *   npx tsx scripts/solon/cast-vote.ts --session <sessionId> --choice yes|no|abstain
 */
import { parseArgs } from "node:util";
import {
  addressFromPrivateKey,
  signBitcoinMessage,
  solonVoteMessage,
} from "../../src/lib/integrations/solon-message";

const { values } = parseArgs({
  options: {
    session: { type: "string" },
    choice: { type: "string" },
  },
});

async function main() {
  const { session, choice } = values;
  if (!session || !choice || !["yes", "no", "abstain"].includes(choice)) {
    console.error("required: --session <sessionId> --choice yes|no|abstain");
    process.exit(1);
  }
  const privateKey = process.env.LOKI_SOLON_PRIVKEY;
  if (!privateKey) {
    console.error("LOKI_SOLON_PRIVKEY is not set — Loki votes only from its own environment");
    process.exit(1);
  }

  const address = addressFromPrivateKey(privateKey);
  const message = solonVoteMessage({ sessionId: session, choice, memberAddress: address });
  const signature = signBitcoinMessage(message, privateKey);
  const base = process.env.SOLON_BASE_URL || "https://solon.orangecat.ch";

  console.log(`voting as ${address} (Loki) on session ${session}: ${choice}`);
  const res = await fetch(`${base}/api/sessions/${encodeURIComponent(session)}/votes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ choice, address, signature }),
  });
  const verdict = await res.json();
  console.log(JSON.stringify(verdict, null, 2));
  if (!verdict.stored) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
