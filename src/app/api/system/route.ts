import { NextResponse } from "next/server";
import { runTool } from "@/lib/tools";

export async function GET() {
  const [memory, disk, uptime] = await Promise.all([
    runTool("free -h | head -3", 5000),
    runTool("df -h / | tail -1", 5000),
    runTool("uptime -p", 5000),
  ]);

  // Check OpenClaw gateway
  const gateway = await runTool(
    "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18789/health 2>/dev/null || echo 'down'",
    5000,
  );

  return NextResponse.json({
    memory: memory.data ?? null,
    disk: disk.data ?? null,
    uptime: uptime.data ?? null,
    gatewayStatus: gateway.data === "200" ? "ok" : "down",
  });
}
