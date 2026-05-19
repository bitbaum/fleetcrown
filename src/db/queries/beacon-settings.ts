import { db } from "@/db";
import { beaconSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  DEFAULT_BEACON_COUNTDOWN_S,
  DEFAULT_BEACON_MIN_IDLE_S,
  DEFAULT_POPUP_MODE,
} from "@/lib/constants/control";

export type BeaconSettingsData = {
  popup_mode:             string;
  countdown_seconds:      number;
  min_idle_seconds:       number;
  whisper_model:          string;
  transcription_provider: string;
};

const DEFAULTS: BeaconSettingsData = {
  popup_mode:             DEFAULT_POPUP_MODE,
  countdown_seconds:      DEFAULT_BEACON_COUNTDOWN_S,
  min_idle_seconds:       DEFAULT_BEACON_MIN_IDLE_S,
  whisper_model:          "base",
  transcription_provider: "auto",
};

export async function getBeaconSettings(userId: string): Promise<BeaconSettingsData> {
  const rows = await db
    .select()
    .from(beaconSettings)
    .where(eq(beaconSettings.userId, userId))
    .limit(1);

  if (!rows[0]) return { ...DEFAULTS };

  return {
    popup_mode:             rows[0].popupMode,
    countdown_seconds:      rows[0].countdownSeconds,
    min_idle_seconds:       rows[0].minIdleSeconds,
    whisper_model:          rows[0].whisperModel,
    transcription_provider: rows[0].transcriptionProvider,
  };
}

export async function upsertBeaconSettings(
  userId: string,
  patch: Partial<BeaconSettingsData>,
): Promise<BeaconSettingsData> {
  const existing = await getBeaconSettings(userId);
  const merged: BeaconSettingsData = { ...existing, ...patch };

  await db
    .insert(beaconSettings)
    .values({
      userId,
      popupMode:             merged.popup_mode,
      countdownSeconds:      merged.countdown_seconds,
      minIdleSeconds:        merged.min_idle_seconds,
      whisperModel:          merged.whisper_model,
      transcriptionProvider: merged.transcription_provider,
    })
    .onConflictDoUpdate({
      target: beaconSettings.userId,
      set: {
        popupMode:             merged.popup_mode,
        countdownSeconds:      merged.countdown_seconds,
        minIdleSeconds:        merged.min_idle_seconds,
        whisperModel:          merged.whisper_model,
        transcriptionProvider: merged.transcription_provider,
        updatedAt:             new Date(),
      },
    });

  return merged;
}
