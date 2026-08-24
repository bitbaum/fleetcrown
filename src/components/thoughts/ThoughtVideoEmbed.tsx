"use client";

import { parseVideoEmbed, videoEmbedSrc } from "@fleetcrown/bip";

/**
 * Trusted embeds for Thoughts essays — allowlisted hosts only (via @fleetcrown/bip).
 */

export { parseVideoEmbed };

export function ThoughtVideoEmbed({ url }: { url: string }) {
  const parsed = parseVideoEmbed(url);
  if (!parsed) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-accent-text underline">
        {url}
      </a>
    );
  }

  const src = videoEmbedSrc(parsed);

  return (
    <figure className="my-8 overflow-hidden rounded-xl border border-border-subtle bg-surface-raised">
      <div className="relative aspect-video w-full">
        <iframe
          src={src}
          title={`${parsed.provider} embed`}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    </figure>
  );
}
