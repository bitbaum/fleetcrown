"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";

// Share affordance for essay pages: X intent + LinkedIn share + copy link.
// The absolute URL is built server-side (APP_URL SSOT in config/brand.ts)
// and passed in — window.location would disagree with the canonical URL
// behind proxies/preview hosts.
export function ShareBar({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);

  const xHref = `https://x.com/intent/post?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`;
  const linkedInHref = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (permissions, http) — leave the button as-is;
      // the URL is still in the address bar.
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="ui-micro-label">Share</span>
      <a
        href={xHref}
        target="_blank"
        rel="noopener noreferrer"
        className="ui-btn-chip"
        aria-label={`Share "${title}" on X`}
      >
        X
      </a>
      <a
        href={linkedInHref}
        target="_blank"
        rel="noopener noreferrer"
        className="ui-btn-chip"
        aria-label={`Share "${title}" on LinkedIn`}
      >
        LinkedIn
      </a>
      <button type="button" onClick={copyLink} className="ui-btn-chip" aria-label="Copy link">
        {copied ? (
          <span className="inline-flex items-center gap-1">
            <Check className="h-3.5 w-3.5" /> Copied
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <Link2 className="h-3.5 w-3.5" /> Copy link
          </span>
        )}
      </button>
    </div>
  );
}
