import { NextResponse } from "next/server";
import { runTool } from "@/lib/tools";
import { OPENCLAW_GATEWAY_URL } from "@/lib/constants";

export async function GET() {
  const [memory, disk, uptime] = await Promise.all([
    runTool("free -h | head -3", 5000),
    runTool("df -h / | tail -1", 5000),
    runTool("uptime -p", 5000),
  ]);

  const gateway = await runTool(
    `curl -s -o /dev/null -w '%{http_code}' ${OPENCLAW_GATEWAY_URL}/health 2>/dev/null || echo 'down'`,
    5000,
  );

  return NextResponse.json({
    memory: memory.data ?? null,
    disk: disk.data ?? null,
    uptime: uptime.data ?? null,
    gatewayStatus: gateway.data === "200" ? "ok" : "down",
  });
}
