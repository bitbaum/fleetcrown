#!/usr/bin/env python3
"""Transcribe audio via local faster-whisper (CTranslate2 — no torch, int8 CPU).

Prints the transcript to stdout. Used as the self-hosted fallback when Groq is
unavailable (see src/app/api/beacon/transcribe/route.ts). Lighter on RAM/CPU
than openai-whisper, which matters on the shared Hetzner box.

Usage: transcribe.py <audio.wav> [model_size]   (model defaults to "base")
"""
import sys
import warnings

warnings.filterwarnings("ignore")
from faster_whisper import WhisperModel  # noqa: E402


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(1)
    audio = sys.argv[1]
    model_size = sys.argv[2] if len(sys.argv) > 2 else "base"
    # int8 on CPU keeps memory ~200MB for base; the model is cached under
    # ~/.cache/huggingface after first download.
    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    segments, _info = model.transcribe(audio, vad_filter=True)
    print(" ".join(seg.text.strip() for seg in segments).strip())


if __name__ == "__main__":
    main()
