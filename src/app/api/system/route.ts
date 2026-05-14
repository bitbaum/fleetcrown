import { NextResponse } from "next/server";
import { runTool } from "@/lib/tools";
import { OPENCLAW_GATEWAY_URL } from "@/lib/constants";
import { isRuntimeAvailable } from "@/lib/runtime";

export async function GET() {
  if (!isRuntimeAvailable()) {
    return NextResponse.json({
      mem: null, swap: null, disk: null, uptime: null, gateway: null, runtime: false,
    });
  }
  // Use LC_ALL=C to force English column headers for reliable parsing
  const [memRaw, diskRaw, uptime, gateway] = await Promise.all([
    runTool("LC_ALL=C free -m | awk 'NR==2{print $2,$3,$7} NR==3{print $2,$3}'", 5000),
    runTool("LC_ALL=C df -h / | awk 'NR==2{print $2,$3,$4,$5}'", 5000),
    runTool("uptime -p", 5000),
    runTool(
      `curl -s -o /dev/null -w '%{http_code}' ${OPENCLAW_GATEWAY_URL}/health 2>/dev/null || echo 'down'`,
      5000,
    ),
  ]);

  // Parse memory: "total used avail\nswapTotal swapUsed" in MiB
  const memLines = (memRaw.data ?? "").trim().split("\n");
  const [memTotal, memUsed, memAvail] = (memLines[0] ?? "").split(" ").map(Number);
  const [swapTotal, swapUsed] = (memLines[1] ?? "").split(" ").map(Number);

  // Parse disk: "Size Used Avail Use%" e.g. "233G 175G 47G 80%"
  const diskParts = (diskRaw.data ?? "").trim().split(/\s+/);
  const [diskSize, diskUsed, diskAvail, diskPct] = diskParts;

  return NextResponse.json({
    mem: { totalMiB: memTotal, usedMiB: memUsed, availMiB: memAvail },
    swap: { totalMiB: swapTotal, usedMiB: swapUsed },
    disk: { size: diskSize, used: diskUsed, avail: diskAvail, pct: diskPct },
    uptime: uptime.data?.trim() ?? null,
    gatewayStatus: gateway.data === "200" ? "ok" : "down",
  });
}
