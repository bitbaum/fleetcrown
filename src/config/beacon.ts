import { join } from "path";
import { homedir } from "os";

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
