"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type VoiceInputStatus = "idle" | "recording" | "transcribing" | "error";

type UseVoiceInputResult = {
  status: VoiceInputStatus;
  error: string | null;
  isSupported: boolean;
  start: () => Promise<void>;
  stop: () => void;
  cancel: () => void;
};

type Options = {
  /** Endpoint that accepts multipart/form-data { audio: File } → { text }. */
  endpoint?: string;
  onTranscript?: (text: string) => void;
  /** Hard cap on recording duration — auto-stop if user forgets. */
  maxDurationMs?: number;
};

const DEFAULT_ENDPOINT = "/api/control/transcribe";
const DEFAULT_MAX_DURATION_MS = 60_000;
const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg"];

/**
 * Drives a single MediaRecorder cycle and posts the resulting blob to the
 * transcription endpoint. Stateless across cycles — caller decides what to
 * do with the resulting transcript (e.g. fill the palette search input).
 *
 * Greenfield extraction from BeaconClient.tsx so any surface (palette today,
 * Quick Dispatch tomorrow) can light up voice without duplicating the
 * MediaRecorder boilerplate.
 */
export function useVoiceInput(opts: Options = {}): UseVoiceInputResult {
  const endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;
  const onTranscript = opts.onTranscript;
  const maxDurationMs = opts.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;

  const [status, setStatus] = useState<VoiceInputStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);

  const isSupported = typeof window !== "undefined"
    && typeof window.MediaRecorder !== "undefined"
    && !!navigator.mediaDevices?.getUserMedia;

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
  }, []);

  useEffect(() => releaseStream, [releaseStream]);

  const start = useCallback(async () => {
    if (!isSupported) {
      setError("Voice input is not supported in this browser.");
      setStatus("error");
      return;
    }
    if (status === "recording" || status === "transcribing") return;

    setError(null);
    cancelledRef.current = false;
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        releaseStream();
        if (cancelledRef.current) {
          setStatus("idle");
          return;
        }
        if (chunksRef.current.length === 0) {
          setStatus("idle");
          return;
        }
        setStatus("transcribing");
        const blob = new Blob(chunksRef.current, { type: mime || "audio/webm" });
        const form = new FormData();
        form.append("audio", blob, `voice-${Date.now()}.webm`);
        try {
          const res = await fetch(endpoint, { method: "POST", body: form });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            setError(typeof data.error === "string" ? data.error : `Transcription failed (${res.status}).`);
            setStatus("error");
            return;
          }
          const text = typeof data.text === "string" ? data.text.trim() : "";
          if (!text) {
            setError("No speech detected. Try again.");
            setStatus("error");
            return;
          }
          onTranscript?.(text);
          setStatus("idle");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Network error.");
          setStatus("error");
        }
      };

      recorder.start();
      setStatus("recording");
      stopTimerRef.current = window.setTimeout(() => {
        if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      }, maxDurationMs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Microphone permission denied.";
      setError(/permission/i.test(msg) ? "Microphone permission denied. Allow access and try again." : msg);
      setStatus("error");
      releaseStream();
    }
  }, [endpoint, isSupported, maxDurationMs, onTranscript, releaseStream, status]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    releaseStream();
    setStatus("idle");
    setError(null);
  }, [releaseStream]);

  return { status, error, isSupported, start, stop, cancel };
}
