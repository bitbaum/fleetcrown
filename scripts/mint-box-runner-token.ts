/**
 * Provision a runner token for the headless box-runner and write it directly to
 * the token file — the box-runner equivalent of the desktop "install runner"
 * flow. Mints a fresh ck_ token (never an existing user secret), so it can be
 * revoked independently from Settings.
 *
 * Usage (run on the box, from /opt/fleetcrown/runner, with DATABASE_URL set):
 *   tsx scripts/mint-box-runner-token.ts [outPath]
 * Default outPath = ~/.config/fleetcrown/fleet-runner-token (token-store's path).
 *
 * Prints the owner userId + token PREFIX only (never the full token).
 */
import fs from "fs";
import path from "path";
import os from "os";
import { createAgentToken } from "@/db/queries/agent-tokens";
import { getSelfImprovementTarget } from "@/db/queries/frontier";
import { getUserById } from "@/db/queries/users";

async function main(): Promise<void> {
  const target = await getSelfImprovementTarget();
  if (!target) {
    console.error("[mint] no owner found (no 'fleetcrown' entity). Aborting.");
    process.exit(1);
  }
  const user = await getUserById(target.userId).catch(() => null);
  const outPath =
    process.argv[2] || path.join(os.homedir(), ".config", "fleetcrown", "fleet-runner-token");

  const { token } = await createAgentToken(target.userId, "box-runner");

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, token, { mode: 0o600 });
  fs.chmodSync(outPath, 0o600);

  console.log(
    `[mint] wrote box-runner token ${token.slice(0, 9)}… for user ${target.userId}` +
      `${user?.email ? ` (${user.email})` : ""} → ${outPath}`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("[mint] failed:", e);
  process.exit(1);
});
