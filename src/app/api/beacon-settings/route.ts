import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { MIN_BEACON_COUNTDOWN_S, MAX_BEACON_COUNTDOWN_S, MAX_BEACON_MIN_IDLE_S } from "@/lib/constants/control";
import { WHISPER_MODEL_VALUES, TRANSCRIPTION_PROVIDER_VALUES, POPUP_MODE_VALUES } from "@/config/beacon";
import { getApiUserId } from "@/lib/session";
import { getBeaconSettings, upsertBeaconSettings } from "@/db/queries/beacon-settings";

export type { BeaconSettingsData } from "@/db/queries/beacon-settings";

const PatchBody = z.object({
  popup_mode:             z.enum(POPUP_MODE_VALUES).optional(),
  countdown_seconds:      z.number().int().min(MIN_BEACON_COUNTDOWN_S).max(MAX_BEACON_COUNTDOWN_S).optional(),
  whisper_model:          z.enum(WHISPER_MODEL_VALUES).optional(),
  transcription_provider: z.enum(TRANSCRIPTION_PROVIDER_VALUES).optional(),
  min_idle_seconds:       z.number().int().min(0).max(MAX_BEACON_MIN_IDLE_S).optional(),
});

export async function GET() {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getBeaconSettings(userId));
}

export async function PATCH(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataOrResp = await readJsonBody(req, PatchBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const updated = await upsertBeaconSettings(userId, dataOrResp);
  return NextResponse.json(updated);
}
