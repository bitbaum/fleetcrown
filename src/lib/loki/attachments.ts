/**
 * Loki composer attachments — SSOT for the limits and the prompt rendering of
 * text files folded into a dispatch. Shared by the client guard (Composer) and
 * the server (messages route) so the caps live in exactly one place.
 *
 * Design: attachments are read as TEXT client-side and appended to the prompt
 * the agent receives — no upload, no storage, no binary handling. This is the
 * simplest correct transport; revisit if real file upload is ever needed.
 */
import type { Attachment } from "@/components/loki/types";

/** Max files per message. */
export const MAX_ATTACHMENTS = 5;
/** Max characters per file — it goes inline into the prompt, so cap it. */
export const MAX_ATTACHMENT_CHARS = 100_000;

/**
 * Render attachments as a prompt suffix the agent can read, or "" when there
 * are none. Each file is fenced with its name so the agent knows what it is.
 */
export function renderAttachments(attachments: Attachment[] | undefined): string {
  if (!attachments || attachments.length === 0) return "";
  return attachments
    .map((a) => `\n\n--- Attached file: ${a.name} ---\n${a.content}`)
    .join("");
}
