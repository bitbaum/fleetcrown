import { NextResponse } from "next/server";
import { runTool } from "@/lib/tools";
import { OPENCLAW_GATEWAY_URL } from "@/lib/constants";
import { isRuntimeAvailable } from "@/lib/runtime";
import { getSessionUserId } from "@/lib/session";

// The empty payload returned to unauthenticated callers and when no runtime is
// present — same shape the /system page already handles, so a monitor polling
// this GET keeps working but learns nothing about host capacity/load.
const EMPTY = { mem: null, swap: null, disk: null, uptime: null, gatewayStatus: "down", runtime: false };

export async function GET() {
  // GET is excluded from the auth matcher for runner/monitoring reachability,
  // but host mem/disk/uptime is real telemetry — only expose it to a signed-in
  // user; everyone else gets the benign empty payload (no 401 that could break
  // a poller, no fingerprintable capacity data).
  if (!(await getSessionUserId())) {
    return NextResponse.json(EMPTY);
  }
  if (!isRuntimeAvailable()) {
    return NextResponse.json(EMPTY);
  }
  // LC_ALL=C forces English column headers and reliable awk parsing.
  // df -BM emits values like "238444M" — gsub strips the M and % so the
  // client receives pure MiB integers and can defer all display rounding to
  // lib/format#formatBytes.
  const [memRaw, diskRaw, uptime, gateway] = await Promise.all([
    runTool("LC_ALL=C free -m | awk 'NR==2{print $2,$3,$7} NR==3{print $2,$3}'", 5000),
    runTool(
      "LC_ALL=C df -BM / | awk 'NR==2{ gsub(/[M%]/,\"\"); print $2,$3,$4,$5 }'",
      5000,
    ),
    runTool("uptime -p", 5000),
    runTool(
      `curl -s -o /dev/null -w '%{http_code}' ${OPENCLAW_GATEWAY_URL}/health 2>/dev/null || echo 'down'`,
      5000,
    ),
  ]);

  // Memory: "total used avail\nswapTotal swapUsed" in MiB
  const memLines = (memRaw.data ?? "").trim().split("\n");
  const [memTotal, memUsed, memAvail] = (memLines[0] ?? "").split(" ").map(Number);
  const [swapTotal, swapUsed] = (memLines[1] ?? "").split(" ").map(Number);

  // Disk: "totalMiB usedMiB availMiB pct"
  const [dTotal, dUsed, dAvail, dPct] = (diskRaw.data ?? "")
    .trim()
    .split(/\s+/)
    .map(Number);
  const diskOk = [dTotal, dUsed, dAvail, dPct].every((n) => Number.isFinite(n));

  return NextResponse.json({
    mem: { totalMiB: memTotal, usedMiB: memUsed, availMiB: memAvail },
    swap: { totalMiB: swapTotal, usedMiB: swapUsed },
    disk: diskOk ? { totalMiB: dTotal, usedMiB: dUsed, availMiB: dAvail, pct: dPct } : null,
    uptime: uptime.data?.trim() ?? null,
    gatewayStatus: gateway.data === "200" ? "ok" : "down",
  });
}
