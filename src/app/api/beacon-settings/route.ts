import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "fs/promises";
import { homedir } from "os";
import { join, dirname } from "path";
import { readJsonBody, z } from "@/lib/api/route-helpers";

const SETTINGS_PATH = join(homedir(), ".config", "agent-dashboard-settings.json");

const VALID_MODELS = ["tiny", "base", "small", "medium", "large"] as const;

const PatchBody = z.object({
  countdown_seconds: z.number().int().min(5).max(300).optional(),
  whisper_model: z.enum(VALID_MODELS).optional(),
  prefer_browser_ready_ui: z.boolean().optional(),
});

export type BeaconSettingsData = {
  countdown_seconds: number;
  whisper_model: string;
  prefer_browser_ready_ui: boolean;
};

async function readSettings(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(SETTINGS_PATH, "utf-8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function writeSettings(data: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(SETTINGS_PATH), { recursive: true });
  await writeFile(SETTINGS_PATH, JSON.stringify(data, null, 2) + "\n");
}

export async function GET() {
  const s = await readSettings();
  const result: BeaconSettingsData = {
    countdown_seconds: typeof s.countdown_seconds === "number" ? s.countdown_seconds : 30,
    whisper_model: typeof s.whisper_model === "string" ? s.whisper_model : "base",
    prefer_browser_ready_ui: s.prefer_browser_ready_ui === true,
  };
  return NextResponse.json(result);
}

export async function PATCH(req: NextRequest) {
  const dataOrResp = await readJsonBody(req, PatchBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const current = await readSettings();
  if (dataOrResp.countdown_seconds !== undefined) current.countdown_seconds = dataOrResp.countdown_seconds;
  if (dataOrResp.whisper_model !== undefined) current.whisper_model = dataOrResp.whisper_model;
  if (dataOrResp.prefer_browser_ready_ui !== undefined) current.prefer_browser_ready_ui = dataOrResp.prefer_browser_ready_ui;
  await writeSettings(current);
  return NextResponse.json({ ok: true });
}
