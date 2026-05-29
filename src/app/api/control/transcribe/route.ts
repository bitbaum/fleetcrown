/**
 * /api/control/transcribe — alias of /api/beacon/transcribe so the control
 * surface (command palette voice input, future per-project mic) has a route
 * named after where it lives. Implementation is owned by the beacon route;
 * this file is intentionally one line of re-export to keep a single source
 * of truth for Whisper/Groq routing during the beacon retirement.
 *
 * When the beacon route is finally removed in Stage 6, the implementation
 * moves here and this file becomes the canonical source.
 */
export { POST } from "@/app/api/beacon/transcribe/route";
