"use client";

import { useRef, useCallback } from "react";
import { useWhisperMic } from "./use-whisper-mic";

/**
 * Wraps useWhisperMic with a "pending action" state machine so recording can be
 * stopped programmatically (wrapSend / wrapEnqueue) and the resulting transcript
 * is automatically routed to the correct handler once Whisper finishes.
 *
 * Both IntentButtonPanel and BeaconBody share this exact pattern — extracted here
 * to eliminate the duplicated pendingMicActionRef / appendTranscript boilerplate.
 */
export function useMicComposer({
  custom,
  onAppend,
  onSendAfterRecording,
  onEnqueueAfterRecording,
}: {
  custom: string;
  onAppend: (newText: string) => void;
  onSendAfterRecording: (text: string) => void;
  onEnqueueAfterRecording: (text: string) => void;
}) {
  const pendingRef = useRef<"send" | "queue" | null>(null);

  const appendTranscript = useCallback(
    (transcribed: string) => {
      const newText = (custom ? `${custom} ${transcribed}` : transcribed).trim();
      onAppend(newText);
      const pending = pendingRef.current;
      if (pending && newText) {
        pendingRef.current = null;
        if (pending === "send") onSendAfterRecording(newText);
        else onEnqueueAfterRecording(newText);
      }
    },
    [custom, onAppend, onSendAfterRecording, onEnqueueAfterRecording],
  );

  const {
    listening,
    processing,
    error: micError,
    toggle: toggleMic,
    waveformBars,
    recordingSeconds,
    maxSeconds: maxRecordingSeconds,
  } = useWhisperMic(appendTranscript);

  // Call instead of the Send button handler. If recording is active, stops the mic
  // and queues the send action; otherwise calls the fallback immediately.
  const wrapSend = useCallback(
    (fallback: () => void) => {
      if (listening) {
        pendingRef.current = "send";
        toggleMic();
        return;
      }
      fallback();
    },
    [listening, toggleMic],
  );

  // Same pattern for the queue (enqueue) button.
  const wrapEnqueue = useCallback(
    (fallback: () => void) => {
      if (listening) {
        pendingRef.current = "queue";
        toggleMic();
        return;
      }
      fallback();
    },
    [listening, toggleMic],
  );

  return {
    listening,
    processing,
    micError,
    toggleMic,
    waveformBars,
    recordingSeconds,
    maxRecordingSeconds,
    wrapSend,
    wrapEnqueue,
  };
}
