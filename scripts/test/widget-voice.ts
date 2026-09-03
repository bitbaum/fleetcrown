// Dictation must never eat what the visitor already typed.
//
// The mic appends into the same textarea the visitor was using, and people
// dictate in bursts — record, read it back, record more. Replacing instead of
// appending would silently destroy the sentence they just wrote, on someone
// else's site, with no undo. These pin the merge rules.
// Run: npx tsx scripts/test/widget-voice.ts
import { formatElapsed, isMicrophoneAllowedByPolicy, mergeTranscript } from "../../widget/voice";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error(`✗ ${label}`);
  }
}

const MAX = 2000;

// ---- mergeTranscript ----
ok(
  mergeTranscript("", "hello there", MAX) === "hello there",
  "empty box takes the transcript as-is",
);
ok(
  mergeTranscript("the button", "is broken", MAX) === "the button is broken",
  "appends with a single joining space",
);
ok(
  mergeTranscript("the button ", "is broken", MAX) === "the button is broken",
  "does not double the space when the existing text already ends in one",
);
ok(
  mergeTranscript("first line\n", "second", MAX) === "first line\nsecond",
  "a trailing newline counts as whitespace — no space is inserted",
);
ok(mergeTranscript("kept", "   ", MAX) === "kept", "a whitespace-only transcript changes nothing");
ok(mergeTranscript("kept", "", MAX) === "kept", "an empty transcript changes nothing");
ok(mergeTranscript("", "  padded  ", MAX) === "padded", "the incoming transcript is trimmed");

// The cap is the same 2000 the ingest zod schema enforces. Exceeding it client
// side would produce a submission the API rejects after the visitor spoke.
ok(mergeTranscript("a".repeat(1999), "bbb", MAX).length === MAX, "never exceeds the field cap");
ok(
  mergeTranscript("", "x".repeat(2500), MAX).length === MAX,
  "a single over-long transcript is clipped to the cap",
);
ok(
  mergeTranscript("a".repeat(2100), "", MAX).length === MAX,
  "an already-over-cap box is clipped rather than grown",
);

// ---- Permissions-Policy: the reason a "Speak" button could only ever fail ----
//
// orangecat.ch sends `permissions-policy: camera=(), microphone=(), geolocation=()`.
// An empty allowlist denies the mic to EVERY origin including the site itself,
// so getUserMedia rejects with NotAllowedError and no prompt is ever shown —
// measured there as permissionState "denied", not "prompt".
//
// The trap: navigator.mediaDevices.getUserMedia still EXISTS in that state. A
// support check that only looks for the API therefore passes, draws the
// button, and hands the visitor an error they cannot resolve — there is
// nothing for them to allow. Only the policy tells the truth.
const realDocument = (globalThis as { document?: unknown }).document;
function withFeaturePolicy(value: unknown, run: () => void) {
  (globalThis as { document?: unknown }).document = value;
  try {
    run();
  } finally {
    if (realDocument === undefined) delete (globalThis as { document?: unknown }).document;
    else (globalThis as { document?: unknown }).document = realDocument;
  }
}

withFeaturePolicy({ featurePolicy: { allowsFeature: (f: string) => f !== "microphone" } }, () => {
  ok(
    isMicrophoneAllowedByPolicy() === false,
    "a document whose policy denies the microphone reports it as blocked",
  );
});
withFeaturePolicy({ featurePolicy: { allowsFeature: () => true } }, () => {
  ok(isMicrophoneAllowedByPolicy() === true, "an allowing policy reports allowed");
});
// Unknown must mean allowed: featurePolicy is non-standard and missing in some
// browsers. Failing closed there would hide a WORKING mic, which is a worse
// error than a click that fails with a readable message.
withFeaturePolicy({}, () => {
  ok(isMicrophoneAllowedByPolicy() === true, "no featurePolicy API — treated as allowed");
});
withFeaturePolicy(
  {
    featurePolicy: {
      allowsFeature: () => {
        throw new Error("boom");
      },
    },
  },
  () => {
    ok(isMicrophoneAllowedByPolicy() === true, "a throwing featurePolicy is treated as allowed");
  },
);

// ---- formatElapsed ----
ok(formatElapsed(0) === "0:00", "zero renders as 0:00");
ok(formatElapsed(7_000) === "0:07", "seconds are zero-padded");
ok(formatElapsed(62_000) === "1:02", "crosses into minutes");
ok(formatElapsed(600_000) === "10:00", "two-digit minutes");
ok(formatElapsed(-5_000) === "0:00", "negative clamps to zero rather than rendering 0:-5");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
