import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { DEFAULT_BEACON_COUNTDOWN_S, MIN_BEACON_COUNTDOWN_S, MAX_BEACON_COUNTDOWN_S, DEFAULT_BEACON_MIN_IDLE_S, MAX_BEACON_MIN_IDLE_S } from "@/lib/constants/control";
import { WHISPER_MODEL_VALUES, TRANSCRIPTION_PROVIDER_VALUES, BEACON_SETTINGS_PATH } from "@/config/beacon";
import { getApiUserId } from "@/lib/session";

const PatchBody = z.object({
  countdown_seconds:    z.number().int().min(MIN_BEACON_COUNTDOWN_S).max(MAX_BEACON_COUNTDOWN_S).optional(),
  whisper_model:        z.enum(WHISPER_MODEL_VALUES).optional(),
  transcription_provider: z.enum(TRANSCRIPTION_PROVIDER_VALUES).optional(),
  min_idle_seconds:     z.number().int().min(0).max(MAX_BEACON_MIN_IDLE_S).optional(),
});

export type BeaconSettingsData = {
  countdown_seconds: number;
  whisper_model: string;
  transcription_provider: string;
  min_idle_seconds: number;
};

async function readSettings(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(BEACON_SETTINGS_PATH, "utf-8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function writeSettings(data: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(BEACON_SETTINGS_PATH), { recursive: true });
  await writeFile(BEACON_SETTINGS_PATH, JSON.stringify(data, null, 2) + "\n");
}

export async function GET() {
  const s = await readSettings();
  const result: BeaconSettingsData = {
    countdown_seconds:    typeof s.countdown_seconds === "number" ? s.countdown_seconds : DEFAULT_BEACON_COUNTDOWN_S,
    whisper_model:        typeof s.whisper_model === "string" ? s.whisper_model : "base",
    transcription_provider: typeof s.transcription_provider === "string" ? s.transcription_provider : "auto",
    min_idle_seconds:     typeof s.min_idle_seconds === "number" ? s.min_idle_seconds : DEFAULT_BEACON_MIN_IDLE_S,
  };
  return NextResponse.json(result);
}

export async function PATCH(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataOrResp = await readJsonBody(req, PatchBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const current = await readSettings();
  if (dataOrResp.countdown_seconds !== undefined)      current.countdown_seconds      = dataOrResp.countdown_seconds;
  if (dataOrResp.whisper_model !== undefined)          current.whisper_model          = dataOrResp.whisper_model;
  if (dataOrResp.transcription_provider !== undefined) current.transcription_provider = dataOrResp.transcription_provider;
  if (dataOrResp.min_idle_seconds !== undefined)       current.min_idle_seconds       = dataOrResp.min_idle_seconds;
  await writeSettings(current);
  return NextResponse.json({ ok: true });
}
