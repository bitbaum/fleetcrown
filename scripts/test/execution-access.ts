/**
 * Inline tests for multitenant execution routing.
 * Run: npx tsx scripts/test/execution-access.ts
 */
import { decideQueuedExecution, type ExecutionAccess } from "@/lib/execution-access";

function access(input: {
  cloudBuilderAllowed: boolean;
  cloud?: boolean;
  local?: boolean;
}): ExecutionAccess {
  return {
    userId: "user-test",
    cloudBuilderAllowed: input.cloudBuilderAllowed,
    presence: {
      cloud: input.cloud ?? false,
      local: input.local ?? false,
      any: Boolean(input.cloud || input.local),
    },
  };
}

const founderCloud = decideQueuedExecution(access({ cloudBuilderAllowed: true, cloud: true }), {
  defaultChannel: "cloud",
});
if (!founderCloud.ok || founderCloud.channel !== "cloud" || founderCloud.runnerConnected !== true) {
  throw new Error("founder cloud routing");
}

const founderCloudOffline = decideQueuedExecution(access({ cloudBuilderAllowed: true }), {
  defaultChannel: "cloud",
});
if (
  !founderCloudOffline.ok ||
  founderCloudOffline.channel !== "cloud" ||
  founderCloudOffline.runnerConnected !== false
) {
  throw new Error("founder cloud offline queue");
}

const tenantLocal = decideQueuedExecution(access({ cloudBuilderAllowed: false, local: true }), {
  defaultChannel: "cloud",
});
if (!tenantLocal.ok || tenantLocal.channel !== "local" || tenantLocal.runnerConnected !== true) {
  throw new Error("tenant reroutes to local builder");
}

const tenantNoBuilder = decideQueuedExecution(access({ cloudBuilderAllowed: false }), {
  defaultChannel: "cloud",
});
if (
  tenantNoBuilder.ok ||
  tenantNoBuilder.status !== 409 ||
  tenantNoBuilder.code !== "builder-required"
) {
  throw new Error("tenant without builder must not queue into the void");
}

const tenantExplicitCloud = decideQueuedExecution(
  access({ cloudBuilderAllowed: false, local: true }),
  { requestedChannel: "cloud" },
);
if (
  tenantExplicitCloud.ok ||
  tenantExplicitCloud.status !== 403 ||
  tenantExplicitCloud.code !== "cloud-builder-private"
) {
  throw new Error("tenant explicit cloud must be blocked");
}

console.log("✓ execution-access tests passed");
