/**
 * Screenshot → dispatch routing for Loki. Vision preflight still runs in
 * vision.ts; this module decides when the turn should dispatch (not chat).
 */

export const DEFAULT_VISION_QUESTION = "What's wrong here and what should we change?";

const IMPLEMENT_SCREENSHOT_RE =
  /\b(implement|build|fix|match|recreate|code|ship|make it look|update the ui|change the ui|apply|adjust)\b/i;

export function isDefaultVisionQuestion(text: string): boolean {
  return text.trim() === DEFAULT_VISION_QUESTION;
}

export function isScreenshotImplementIntent(text: string): boolean {
  return IMPLEMENT_SCREENSHOT_RE.test(text.trim());
}

/** Image attached + project scoped → dispatch when the user wants action, not Q&A. */
export function shouldDispatchScreenshot(
  text: string,
  hasImages: boolean,
  projectKey: string | null,
): boolean {
  if (!hasImages || !projectKey) return false;
  return isScreenshotImplementIntent(text) || isDefaultVisionQuestion(text);
}

/** Agent prompt body before attachmentSuffix (vision analysis) is appended. */
export function screenshotDispatchPrompt(userText: string): string {
  if (isDefaultVisionQuestion(userText)) {
    return "Review the attached screenshot, implement the fixes in code, and align the UI with the intended design.";
  }
  return userText.trim();
}

/** Intent for screenshot dispatches — UX review when the user sent image-only/default ask. */
export function screenshotDispatchIntentId(userText: string): "ux_review" | null {
  if (
    isDefaultVisionQuestion(userText) ||
    /\b(ui|ux|layout|screen|mockup|design)\b/i.test(userText)
  ) {
    return "ux_review";
  }
  return null;
}
