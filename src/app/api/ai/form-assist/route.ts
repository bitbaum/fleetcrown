import { createFormAssistHandler } from "@fleet/ai-forms/server";
import { AI_FORMS } from "@/config/ai-forms";
import { callGroqText } from "@/lib/groq";
import { getApiUserId } from "@/lib/session";
import { jsonOk, jsonError } from "@/lib/api/route-helpers";
import { HTTP_TIMEOUT_LONG_MS } from "@/lib/constants/time";

/**
 * One route for every AI-assisted form in the app.
 *
 * Adding assistance to a new form means adding it to AI_FORMS — nothing here
 * changes. The field registry lives server-side on purpose: the client names a
 * form, never the fields, so it cannot widen what the model is allowed to write.
 */
export const POST = createFormAssistHandler({
  targets: AI_FORMS,

  authorize: async () =>
    (await getApiUserId())
      ? { ok: true }
      : { ok: false, status: 401, error: "Sign in to use the assistant." },

  complete: ({ system, prompt, maxTokens, temperature }) =>
    callGroqText(prompt, {
      systemPrompt: system,
      maxTokens,
      temperature,
      // Form assistance writes several fields at once; the short default
      // timeout cuts off multi-field JSON mid-object.
      timeoutMs: HTTP_TIMEOUT_LONG_MS,
    }),

  respond: (result) =>
    result.ok
      ? jsonOk({ values: result.values, changed: result.changed, message: result.message })
      : jsonError(result.error, 400),
});
