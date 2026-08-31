import os from "node:os";
import path from "node:path";
import {
  assertSandboxCwdAllowed,
  buildDockerRunArgs,
  resolveSandboxConfig,
  sandboxContainerName,
  SandboxExecutor,
  type SandboxExecutorConfig,
} from "../../src/lib/agent-execution/sandbox";
import type { AgentEvent } from "../../src/lib/agent-execution/types";

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗"} ${name}`);
  if (!cond) failures += 1;
}

const root = path.join(os.tmpdir(), "fc-sandbox-root");
const cwd = path.join(root, "tenant-a", "repo");

const config: SandboxExecutorConfig = {
  runtime: "docker",
  image: "ubuntu:24.04",
  workspaceRoot: root,
  network: "none",
  cpus: "1",
  memory: "512m",
  pidsLimit: "128",
  user: "current",
  mountMode: "rw",
  extraRunArgs: [],
};

function hasPair(args: string[], key: string, value: string): boolean {
  return args.some((arg, i) => arg === key && args[i + 1] === value);
}

async function optionalDockerSmoke() {
  if (process.env.FLEETCROWN_TEST_DOCKER_SANDBOX !== "true") return;
  const fs = await import("node:fs");
  fs.mkdirSync(cwd, { recursive: true });
  const executor = new SandboxExecutor({
    ...config,
    image: process.env.FLEETCROWN_TEST_DOCKER_IMAGE || "ubuntu:24.04",
  });
  const events: AgentEvent[] = [];
  const id = "test:sandbox-smoke";
  await executor.provision({
    id,
    cwd,
    command: "bash",
    args: ["-lc", "echo SANDBOX_OK; sleep 0.2"],
  });
  executor.subscribe(id, 0, (e) => events.push(e));
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline && !events.some((e) => e.kind === "exit")) {
    await new Promise((r) => setTimeout(r, 100));
  }
  check(
    "optional docker smoke emits command output",
    events.some((e) => e.kind === "output" && e.data?.includes("SANDBOX_OK")),
  );
  check(
    "optional docker smoke exits",
    events.some((e) => e.kind === "exit"),
  );
  await executor.terminate(id);
}

async function main() {
  const name = sandboxContainerName("user:Project With Spaces");
  check(
    "container names are deterministic",
    name === sandboxContainerName("user:Project With Spaces"),
  );
  check("container names are docker-safe", /^fc-ws-[a-f0-9]{24}$/.test(name));

  check(
    "cwd inside workspace root is accepted",
    assertSandboxCwdAllowed(cwd, root) === path.resolve(cwd),
  );
  try {
    assertSandboxCwdAllowed(path.join(os.tmpdir(), "elsewhere"), root);
    check("cwd outside workspace root is rejected", false);
  } catch {
    check("cwd outside workspace root is rejected", true);
  }

  const args = buildDockerRunArgs(
    {
      id: "user:repo",
      cwd,
      command: "bash",
      args: ["-lc", "pwd"],
      env: { FOO: "bar" },
    },
    config,
    "fc-test",
  );

  check("docker run uses --rm", args.includes("--rm"));
  check("docker run keeps stdin interactive", args.includes("-i"));
  check("docker run applies network policy", hasPair(args, "--network", "none"));
  check("docker run applies cpu limit", hasPair(args, "--cpus", "1"));
  check("docker run applies memory limit", hasPair(args, "--memory", "512m"));
  check("docker run applies pids limit", hasPair(args, "--pids-limit", "128"));
  check("docker run drops capabilities", hasPair(args, "--cap-drop", "ALL"));
  check(
    "docker run blocks privilege escalation",
    hasPair(args, "--security-opt", "no-new-privileges"),
  );
  check(
    "docker run binds cwd at /workspace",
    args.includes(`type=bind,src=${path.resolve(cwd)},dst=/workspace:rw`),
  );
  check("docker run passes explicit env only", hasPair(args, "--env", "FOO=bar"));
  check("docker run ends with requested command", args.slice(-3).join(" ") === "bash -lc pwd");

  const envConfig = resolveSandboxConfig();
  check("default sandbox config has a workspace root", envConfig.workspaceRoot.length > 1);
  check("default sandbox network is deny-by-default", envConfig.network === "none");

  await optionalDockerSmoke();

  console.log(
    failures === 0
      ? "\nALL SANDBOX EXECUTOR TESTS PASSED"
      : `\n${failures} SANDBOX EXECUTOR TEST(S) FAILED`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
