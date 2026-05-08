"use client";

import { useState, useRef, useCallback } from "react";

export function useWhisperMic(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const peakRef = useRef(0);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (autoStopRef.current !== null) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startLevelTracking = useCallback((stream: MediaStream) => {
    peakRef.current = 0;
    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const frame = Math.max(...data) / 255;
        if (frame > peakRef.current) peakRef.current = frame;
        animFrameRef.current = requestAnimationFrame(tick);
      };
      animFrameRef.current = requestAnimationFrame(tick);
    } catch {
      // AudioContext unavailable — peak stays 0, silence check will be skipped
    }
  }, []);

  const toggle = useCallback(async () => {
    if (listening) {
      recorderRef.current?.stop();
      return;
    }
    if (processing) return;

    setError("");
    chunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = err instanceof Error ? (err as DOMException).name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setError("Mic blocked — allow microphone in Chrome settings for localhost");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setError("No microphone found — check your audio input device");
      } else {
        setError(`Mic unavailable: ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }

    streamRef.current = stream;
    startLevelTracking(stream);

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      cleanup();
      setListening(false);
      setProcessing(true);

      const blob = new Blob(chunksRef.current, { type: mimeType });
      chunksRef.current = [];

      if (blob.size < 100) {
        setProcessing(false);
        setError("Recording too short — hold the mic button while speaking");
        return;
      }

      // Skip Whisper if mic was silent the whole time
      if (peakRef.current > 0 && peakRef.current < 0.01) {
        setProcessing(false);
        setError("Microphone too quiet — speak closer or raise input volume");
        return;
      }

      const form = new FormData();
      form.append("audio", blob, "recording.webm");
      try {
        const res = await fetch("/api/beacon/transcribe", { method: "POST", body: form });
        const data = (await res.json()) as { text?: string; error?: string };
        if (!res.ok || !data.text) {
          setError(data.error ?? "No speech detected");
        } else {
          onResult(data.text);
          setError("");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Transcription failed");
      } finally {
        setProcessing(false);
      }
    };

    recorder.start(100);
    setListening(true);

    autoStopRef.current = setTimeout(() => {
      if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
    }, 60_000);
  }, [listening, processing, cleanup, startLevelTracking, onResult]);

  return { listening, processing, error, toggle };
}
