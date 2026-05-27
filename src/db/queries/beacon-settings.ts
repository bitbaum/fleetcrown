import { db } from "@/db";
import { beaconSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  DEFAULT_BEACON_COUNTDOWN_S,
  DEFAULT_BEACON_MIN_IDLE_S,
  DEFAULT_POPUP_MODE,
} from "@/lib/constants/control";
import { AUTO_INJECT_MODE_VALUES, type AutoInjectMode } from "@/config/beacon";

export type { AutoInjectMode } from "@/config/beacon";

export type BeaconSettingsData = {
  popup_mode:             string;
  countdown_seconds:      number;
  min_idle_seconds:       number;
  whisper_model:          string;
  transcription_provider: string;
  auto_inject_mode:       AutoInjectMode;
};

const DEFAULTS: BeaconSettingsData = {
  popup_mode:             DEFAULT_POPUP_MODE,
  countdown_seconds:      DEFAULT_BEACON_COUNTDOWN_S,
  min_idle_seconds:       DEFAULT_BEACON_MIN_IDLE_S,
  whisper_model:          "base",
  transcription_provider: "auto",
  // queue_only: explicit opt-in required for autonomous strategist firing.
  // See schema comment + Cockpit.roadmap.md DONE entry (2026-05-25).
  auto_inject_mode:       "queue_only",
};

function coerceAutoInjectMode(v: string | null | undefined): AutoInjectMode {
  return AUTO_INJECT_MODE_VALUES.includes(v as AutoInjectMode) ? v as AutoInjectMode : "queue_only";
}

/** PyQt mode was retired (see scripts/beacon.py). Legacy DB rows with 'both' or
 *  'pyqt' are coerced to 'web' on read so the UI never offers a dead option. */
function coercePopupMode(stored: string): string {
  return stored === "disabled" ? "disabled" : "web";
}

export async function getBeaconSettings(userId: string): Promise<BeaconSettingsData> {
  const rows = await db
    .select()
    .from(beaconSettings)
    .where(eq(beaconSettings.userId, userId))
    .limit(1);

  if (!rows[0]) return { ...DEFAULTS };

  return {
    popup_mode:             coercePopupMode(rows[0].popupMode),
    countdown_seconds:      rows[0].countdownSeconds,
    min_idle_seconds:       rows[0].minIdleSeconds,
    whisper_model:          rows[0].whisperModel,
    transcription_provider: rows[0].transcriptionProvider,
    auto_inject_mode:       coerceAutoInjectMode(rows[0].autoInjectMode),
  };
}

export async function upsertBeaconSettings(
  userId: string,
  patch: Partial<BeaconSettingsData>,
): Promise<BeaconSettingsData> {
  const inserted: BeaconSettingsData = { ...DEFAULTS, ...patch };
  const updateSet: Partial<typeof beaconSettings.$inferInsert> & { updatedAt: Date } = { updatedAt: new Date() };
  if (patch.popup_mode !== undefined) updateSet.popupMode = patch.popup_mode;
  if (patch.countdown_seconds !== undefined) updateSet.countdownSeconds = patch.countdown_seconds;
  if (patch.min_idle_seconds !== undefined) updateSet.minIdleSeconds = patch.min_idle_seconds;
  if (patch.whisper_model !== undefined) updateSet.whisperModel = patch.whisper_model;
  if (patch.transcription_provider !== undefined) updateSet.transcriptionProvider = patch.transcription_provider;
  if (patch.auto_inject_mode !== undefined) updateSet.autoInjectMode = patch.auto_inject_mode;

  await db
    .insert(beaconSettings)
    .values({
      userId,
      popupMode:             inserted.popup_mode,
      countdownSeconds:      inserted.countdown_seconds,
      minIdleSeconds:        inserted.min_idle_seconds,
      whisperModel:          inserted.whisper_model,
      transcriptionProvider: inserted.transcription_provider,
      autoInjectMode:        inserted.auto_inject_mode,
    })
    .onConflictDoUpdate({
      target: beaconSettings.userId,
      set: updateSet,
    });

  return getBeaconSettings(userId);
}
