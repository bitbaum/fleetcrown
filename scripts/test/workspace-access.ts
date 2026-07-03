import { decideWorkspaceAccessFromSignals } from "../../src/lib/workspace-access";

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗"} ${name}`);
  if (!cond) failures += 1;
}

const local = decideWorkspaceAccessFromSignals({
  runtimeAvailable: true,
  sandboxExecutorEnabled: false,
  cloudBuilderAllowed: false,
});
check("local runtime may use server workspaces", local.ok);

const hostedNoSandbox = decideWorkspaceAccessFromSignals({
  runtimeAvailable: false,
  sandboxExecutorEnabled: false,
  cloudBuilderAllowed: true,
});
check("hosted control plane without sandbox refuses workspaces", !hostedNoSandbox.ok && hostedNoSandbox.code === "server-workspaces-disabled");

const hostedSandboxDenied = decideWorkspaceAccessFromSignals({
  runtimeAvailable: false,
  sandboxExecutorEnabled: true,
  cloudBuilderAllowed: false,
});
check("hosted sandbox refuses non-allowlisted accounts", !hostedSandboxDenied.ok && hostedSandboxDenied.code === "cloud-builder-private");

const hostedSandboxAllowed = decideWorkspaceAccessFromSignals({
  runtimeAvailable: false,
  sandboxExecutorEnabled: true,
  cloudBuilderAllowed: true,
});
check("hosted sandbox allows cloud-builder-allowed accounts", hostedSandboxAllowed.ok);

console.log(failures === 0 ? "\nALL WORKSPACE ACCESS TESTS PASSED" : `\n${failures} WORKSPACE ACCESS TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
