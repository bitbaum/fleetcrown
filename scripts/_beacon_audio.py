"""Beacon — Whisper speech-to-text thread.  Only PyQt6 audio dependency."""
import sys
from pathlib import Path

# Ensure vendor packages are on the path before importing PyQt6.
_v = Path(__file__).resolve().parent.parent / ".python-vendor" / "site-packages"
if _v.exists():
    sys.path.insert(0, str(_v))

from PyQt6.QtCore import QThread, pyqtSignal


class WhisperThread(QThread):
    transcribed = pyqtSignal(str)
    failed      = pyqtSignal(str)
    # Emitted while recording is still active — carries peak amplitude 0.0–1.0
    level       = pyqtSignal(float)
    RATE = 16_000

    def __init__(self, model: str = "base"):
        super().__init__()
        self._recording  = True
        self._model_name = model

    def stop_recording(self):
        self._recording = False

    def run(self):
        try:
            import sounddevice as sd, numpy as np, whisper
            frames = []
            def cb(indata, *_):
                if self._recording:
                    frames.append(indata.copy())
                    peak = float(np.abs(indata).max())
                    self.level.emit(peak)
            with sd.InputStream(samplerate=self.RATE, channels=1,
                                dtype="float32", callback=cb):
                while self._recording:
                    self.msleep(80)
            if not frames:
                self.failed.emit("No audio captured — check your microphone")
                return
            audio = np.concatenate(frames).flatten()
            peak  = float(np.abs(audio).max())
            if peak < 0.003:
                self.failed.emit("Microphone too quiet — speak closer or raise input volume")
                return
            out  = whisper.load_model(self._model_name).transcribe(audio, fp16=False)
            text = out.get("text", "").strip()
            if text:
                self.transcribed.emit(text)
            else:
                self.failed.emit("No speech detected — try speaking more clearly")
        except Exception as exc:
            self.failed.emit(str(exc))
