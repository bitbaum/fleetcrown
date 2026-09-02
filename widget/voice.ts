/**
 * Speak-your-feedback for the embed.
 *
 * Typing a bug report on a phone, on someone else's site, is the step where
 * most reports die. Talking is the lower-effort path, so the mic exists to
 * raise the number of reports that get filed at all.
 *
 * Two rules shape this file:
 *
 * 1. The transcript is a DRAFT, never a submission. It lands in the same
 *    textarea the visitor was already using, appended to whatever they had
 *    typed, and they send it themselves. Speech-to-text mishears things; a mic
 *    that auto-sent would file those mistakes under the visitor's name.
 *
 * 2. Absence of support is not an error. Browsers without MediaRecorder or a
 *    secure context simply never see the button — no dead control, no message
 *    explaining a thing they cannot do.
 */

/** Elapsed-time formatting for the recording chip: 0:07, 1:42. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Append a transcript to whatever is already in the box.
 *
 * Dictation happens in bursts — someone records, reads it back, records more —
 * so this appends rather than replaces, and never exceeds the field cap that
 * the ingest schema also enforces. Joins with a single space only when the
 * existing text does not already end in whitespace, so repeated bursts do not
 * accumulate gaps.
 */
export function mergeTranscript(existing: string, incoming: string, maxLen: number): string {
  const add = incoming.trim();
  if (!add) return existing.slice(0, maxLen);
  if (!existing) return add.slice(0, maxLen);
  const joiner = /\s$/.test(existing) ? "" : " ";
  return (existing + joiner + add).slice(0, maxLen);
}

/**
 * MIME type for MediaRecorder. Chrome/Firefox take Opus in WebM; Safari only
 * offers mp4/aac. Returning "" lets MediaRecorder pick its own default rather
 * than throwing on an unsupported explicit type.
 */
export function pickAudioMime(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  const MR = typeof MediaRecorder !== "undefined" ? MediaRecorder : null;
  if (!MR || typeof MR.isTypeSupported !== "function") return "";
  return candidates.find((t) => MR.isTypeSupported(t)) ?? "";
}

/**
 * Whether to offer the mic at all. getUserMedia is undefined on insecure
 * origins, which is the common case for a customer testing on plain http —
 * hence a support check rather than a try/catch at click time.
 */
export function isVoiceSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined"
  );
}

export type VoiceState = "idle" | "requesting" | "recording" | "transcribing" | "error";

export interface VoiceRecorder {
  start(): Promise<void>;
  stop(): void;
  /** Abandon a recording without transcribing it. */
  cancel(): void;
  state(): VoiceState;
}

export interface VoiceOptions {
  endpoint: string;
  token: string;
  /** Hard cap; the server rejects longer uploads, so stop before spending them. */
  maxMs: number;
  onState: (state: VoiceState, detail?: { error?: string; elapsedMs?: number }) => void;
  onTranscript: (text: string) => void;
}

export function createVoiceRecorder(opts: VoiceOptions): VoiceRecorder {
  let state: VoiceState = "idle";
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let chunks: Blob[] = [];
  let startedAt = 0;
  let tick: ReturnType<typeof setInterval> | null = null;
  let capTimer: ReturnType<typeof setTimeout> | null = null;
  let aborted = false;

  function set(next: VoiceState, detail?: { error?: string; elapsedMs?: number }) {
    state = next;
    opts.onState(next, detail);
  }

  /** Release the mic. Leaving tracks live leaves the browser's recording
   *  indicator on, which reads to a visitor as "this site is still listening". */
  function teardown() {
    if (tick) {
      clearInterval(tick);
      tick = null;
    }
    if (capTimer) {
      clearTimeout(capTimer);
      capTimer = null;
    }
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    recorder = null;
  }

  async function start() {
    if (state === "recording" || state === "requesting") return;
    aborted = false;
    chunks = [];
    set("requesting");
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = (err as Error)?.name ?? "";
      // NotAllowedError covers both "denied now" and "denied permanently".
      const msg =
        name === "NotAllowedError" || name === "SecurityError"
          ? "Microphone permission denied"
          : name === "NotFoundError"
            ? "No microphone found"
            : "Could not start the microphone";
      set("error", { error: msg });
      return;
    }

    const mime = pickAudioMime();
    try {
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch {
      teardown();
      set("error", { error: "Recording is not supported in this browser" });
      return;
    }

    recorder.addEventListener("dataavailable", (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    });

    recorder.addEventListener("stop", () => {
      const type = recorder?.mimeType || mime || "audio/webm";
      const collected = chunks;
      teardown();
      if (aborted) {
        set("idle");
        return;
      }
      void upload(new Blob(collected, { type }), type);
    });

    startedAt = Date.now();
    recorder.start();
    set("recording", { elapsedMs: 0 });

    tick = setInterval(() => {
      if (state === "recording") opts.onState("recording", { elapsedMs: Date.now() - startedAt });
    }, 1000);

    // Stop at the cap rather than letting the visitor record an upload the
    // server will refuse — a silent 413 after two minutes of talking is the
    // worst possible outcome here.
    capTimer = setTimeout(() => {
      if (state === "recording") stop();
    }, opts.maxMs);
  }

  function stop() {
    if (recorder && recorder.state !== "inactive") {
      set("transcribing");
      recorder.stop();
    }
  }

  function cancel() {
    aborted = true;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    else {
      teardown();
      set("idle");
    }
  }

  async function upload(blob: Blob, type: string) {
    if (blob.size < 1000) {
      set("error", { error: "That was too short — hold the button and speak" });
      return;
    }
    try {
      const form = new FormData();
      // Extension matters: the provider sniffs it when the container is
      // ambiguous, and a mislabelled clip transcribes as silence.
      const ext = type.includes("mp4") ? "mp4" : type.includes("ogg") ? "ogg" : "webm";
      form.append("audio", blob, `feedback.${ext}`);
      form.append("token", opts.token);
      const res = await fetch(opts.endpoint, { method: "POST", body: form });
      const json = (await res.json().catch(() => null)) as { text?: string; error?: string } | null;
      if (!res.ok || !json?.text) {
        set("error", { error: json?.error || "Could not transcribe that, try again" });
        return;
      }
      opts.onTranscript(json.text);
      set("idle");
    } catch {
      set("error", { error: "Could not reach the server, try again" });
    }
  }

  return { start, stop, cancel, state: () => state };
}
