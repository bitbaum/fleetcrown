/**
 * Inline tests for builder presence labels.
 * Run: npx tsx scripts/test/builder-presence.ts
 */
import { builderCompactLabel, isCloudRunnerVersion } from "@/lib/builder-presence";

if (!isCloudRunnerVersion("box-0.8.9")) throw new Error("box version detect");
if (isCloudRunnerVersion("0.8.9")) throw new Error("desktop version not cloud");

if (builderCompactLabel("connected", "box-0.8.9") !== "Cloud builder online") {
  throw new Error("cloud label");
}
if (builderCompactLabel("connected", "0.8.9") !== "This computer online") {
  throw new Error("local label");
}
if (builderCompactLabel("offline", null) !== "Builder offline") {
  throw new Error("offline label");
}

console.log("✓ builder-presence tests passed");
