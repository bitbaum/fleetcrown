/**
 * Allowlisted video hosts for company BiP embeds.
 * Never treat arbitrary URLs as iframes.
 */

const YOUTUBE =
  /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{6,})/;
const VIMEO = /^(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(\d+)/;

export function parseVideoEmbed(
  url: string,
): { provider: "youtube" | "vimeo"; id: string } | null {
  const trimmed = url.trim();
  const yt = YOUTUBE.exec(trimmed);
  if (yt) return { provider: "youtube", id: yt[1] };
  const vim = VIMEO.exec(trimmed);
  if (vim) return { provider: "vimeo", id: vim[1] };
  return null;
}

export function videoEmbedSrc(parsed: { provider: "youtube" | "vimeo"; id: string }): string {
  return parsed.provider === "youtube"
    ? `https://www.youtube-nocookie.com/embed/${parsed.id}`
    : `https://player.vimeo.com/video/${parsed.id}`;
}
