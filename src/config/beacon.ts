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

// The five-level autopilot trust ladder. Each level adds one more thing
// FleetCrown decides on your behalf — L1 (you decide everything) to L5 (full
// AI-composed dispatch). Storage values keep legacy names ("off",
// "queue_only", "next_best", "strategist") for migration safety; the UI
// surfaces the new names (Manual, Queue, Beacon, Continuous, Mission) and
// the new "beacon" value is the one being added 2026-05-31 to restore the
// popup UX removed by commit 848da6c. Order in this array reflects the
// trust ladder top-down (Manual → Mission); UI selector iterates this order.
export const AUTO_INJECT_MODE_VALUES = ["off", "queue_only", "beacon", "next_best", "strategist"] as const;
export type AutoInjectMode = (typeof AUTO_INJECT_MODE_VALUES)[number];

export const AUTO_INJECT_MODES: readonly {
  value: AutoInjectMode;
  label: string;
  description: string;
}[] = [
  {
    value: "off",
    label: "Manual",
    description: "L1 · FleetCrown dispatches nothing. You type every prompt in /control and click Send. Total control; zero surprises.",
  },
  {
    value: "queue_only",
    label: "Queue",
    description: "L2 · When an agent finishes, FleetCrown fires the next item from YOUR queue. Stops when queue is empty. Your plan, executed in order.",
  },
  {
    value: "beacon",
    label: "Beacon",
    description: "L3 · When the agent finishes, FleetCrown prepares the next action and shows a handoff popup. If you are away, the countdown can auto-submit that prepared action.",
  },
  {
    value: "next_best",
    label: "Continuous",
    description: "L4 · Drains your queue, then sends the canned next-best recovery/progress template without a popup. Useful for routine cleanup; less context-aware than Mission.",
  },
  {
    value: "strategist",
    label: "Mission",
    description: "L5 · FleetCrown composes a prompt from the handoff, queue, project mission, recent commits, and outcomes, then dispatches it without asking. Highest autonomy; review results regularly.",
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
