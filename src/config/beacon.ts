import { join } from "path";
import { homedir } from "os";

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

export const POPUP_MODE_VALUES = ["both", "web", "pyqt", "disabled"] as const;
export type PopupMode = (typeof POPUP_MODE_VALUES)[number];

export const POPUP_MODES: readonly {
  value: PopupMode;
  label: string;
  description: string;
  pros: string;
  cons: string;
}[] = [
  {
    value: "both",
    label: "Web + Desktop",
    description: "Chrome --app window opens instantly; Control panel follows via SSE.",
    pros: "Fastest: desktop popup appears in < 100 ms, no cold start after first launch",
    cons: "Requires a Chromium browser and display access on the machine running the agent",
  },
  {
    value: "web",
    label: "Web only",
    description: "Beacon popup appears in your Cockpit browser tab via SSE.",
    pros: "Works headlessly — SSH sessions, remote machines, no display required",
    cons: "~1–4 s latency; Cockpit must be open in a browser tab to interact",
  },
  {
    value: "pyqt",
    label: "Desktop only",
    description: "Native PyQt6 window — no browser required.",
    pros: "Native OS widget, works without a browser tab open",
    cons: "Requires PyQt6 + display; browser/Control panel popup is suppressed",
  },
  {
    value: "disabled",
    label: "Disabled",
    description: "No popup fires — agent loops fully autonomously.",
    pros: "Zero interruptions; auto-continue always fires immediately",
    cons: "No human checkpoint — agent runs without asking for direction",
  },
];
