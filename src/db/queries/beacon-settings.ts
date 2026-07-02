import { db } from "@/db";
import { beaconSettings, userProjects } from "@/db/schema";
import { and, eq, isNull, ne, or } from "drizzle-orm";
import {
  DEFAULT_BEACON_COUNTDOWN_S,
  DEFAULT_BEACON_MIN_IDLE_S,
  DEFAULT_POPUP_MODE,
  DEFAULT_AUTO_INJECT_MODE,
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
  // Autopilot — see DEFAULT_AUTO_INJECT_MODE in src/lib/constants/control.ts for
  // the rationale. Safety rails live in /api/control/dispatch + the Stop hook.
  auto_inject_mode:       DEFAULT_AUTO_INJECT_MODE,
};

function coerceAutoInjectMode(v: string | null | undefined): AutoInjectMode {
  return AUTO_INJECT_MODE_VALUES.includes(v as AutoInjectMode) ? v as AutoInjectMode : DEFAULT_AUTO_INJECT_MODE;
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

/**
 * SSOT for "which users have fleet autopilot on" — for schedulers (crons) that
 * fan out across users. A user counts as ON when auto_inject_mode != 'off',
 * INCLUDING users with no beacon row at all: a missing row means
 * DEFAULT_AUTO_INJECT_MODE ('on'), exactly like getBeaconSettings above.
 * The nudge-idle cron previously raw-queried only EXISTING rows, so
 * default-mode users were invisible to the scheduler and the fleet silently
 * never nudged while the Control hero said "Autopilot on" (2026-07-02
 * dead-fleet incident — one state, two interpretations).
 * Scoped to users with active projects so the scheduler skips spectator accounts.
 */
export async function getFleetAutopilotUserIds(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: userProjects.userId })
    .from(userProjects)
    .leftJoin(beaconSettings, eq(beaconSettings.userId, userProjects.userId))
    .where(
      and(
        eq(userProjects.isActive, true),
        or(isNull(beaconSettings.autoInjectMode), ne(beaconSettings.autoInjectMode, "off")),
      ),
    );
  return rows.map((r) => r.userId);
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
