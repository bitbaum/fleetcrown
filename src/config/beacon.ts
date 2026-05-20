import { join } from "path";
import { homedir } from "os";
import { APP_NAME } from "./brand";

/** Legacy settings file path — kept for daemon fallback reads only. */
export const BEACON_SETTINGS_PATH = join(homedir(), ".config", "agent-dashboard-settings.json");

export const WHISPER_MODEL_VALUES = ["tiny", "base", "small", "medium", "large"] as const;
type WhisperModel = (typeof WHISPER_MODEL_VALUES)[number];

export const WHISPER_MODELS: readonly { value: WhisperModel; label: string; note: string }[] = [
  { value: "tiny",   label: "Tiny",   note: "~39 MB · fastest, lower accuracy" },
  { value: "base",   label: "Base",   note: "~74 MB · good balance (default)" },
  { value: "small",  label: "Small",  note: "~244 MB · better accuracy" },
  { value: "medium", label: "Medium", note: "~769 MB · high accuracy" },
  { value: "large",  label: "Large",  note: "~1.5 GB · best accuracy, slowest" },
];

export const TRANSCRIPTION_PROVIDER_VALUES = ["auto", "local", "groq"] as const;
type TranscriptionProvider = (typeof TRANSCRIPTION_PROVIDER_VALUES)[number];

export const TRANSCRIPTION_PROVIDERS: readonly { value: TranscriptionProvider; label: string; note: string }[] = [
  { value: "auto",  label: "Auto",         note: "local when runtime available, Groq as fallback" },
  { value: "local", label: "Local Whisper", note: "your machine's Whisper model — requires runtime" },
  { value: "groq",  label: "Groq cloud",   note: "whisper-large-v3-turbo via API — rate limited" },
];

export const AUTO_INJECT_MODE_VALUES = ["strategist", "queue_only", "next_best", "off"] as const;
export type AutoInjectMode = (typeof AUTO_INJECT_MODE_VALUES)[number];

export const AUTO_INJECT_MODES: readonly {
  value: AutoInjectMode;
  label: string;
  description: string;
}[] = [
  {
    value: "strategist",
    label: "Strategist",
    description: "Groq composes a context-aware prompt from handoff, queue, and recent commits. Best signal-to-noise; needs a working Groq key.",
  },
  {
    value: "queue_only",
    label: "Queue only",
    description: "Fire the next queue item verbatim, or stay quiet when queue is empty. Predictable, never surprises.",
  },
  {
    value: "next_best",
    label: "Canned next-best",
    description: "Skip Groq, fire the static next-best template. Works offline; same prompt every time.",
  },
  {
    value: "off",
    label: "Off",
    description: "Disable auto-inject entirely. You dispatch every prompt by hand.",
  },
];

export const POPUP_MODE_VALUES = ["web", "disabled"] as const;
export type PopupMode = (typeof POPUP_MODE_VALUES)[number];

export const POPUP_MODES: readonly {
  value: PopupMode;
  label: string;
  description: string;
  pros: string;
  cons: string;
}[] = [
  {
    value: "web",
    label: "Web popup",
    description: `Chrome --app window opens at /beacon/live; same UI as ${APP_NAME}.`,
    pros: "Single source of truth — design lives in src/components/control, no native copy to drift",
    cons: `Requires ${APP_NAME} to be running and a Chromium-family browser installed`,
  },
  {
    value: "disabled",
    label: "Disabled",
    description: "No popup fires — agent loops fully autonomously.",
    pros: "Zero interruptions; auto-continue always fires immediately",
    cons: "No human checkpoint — agent runs without asking for direction",
  },
];
