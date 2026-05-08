#!/usr/bin/env python3
"""Transcribe audio via local Whisper. Prints text to stdout."""
import sys, warnings
warnings.filterwarnings("ignore")
import whisper

def main():
    if len(sys.argv) < 2:
        sys.exit(1)
    model_size = sys.argv[2] if len(sys.argv) > 2 else "base"
    model = whisper.load_model(model_size)
    result = model.transcribe(sys.argv[1], fp16=False)
    print(result["text"].strip())

if __name__ == "__main__":
    main()
