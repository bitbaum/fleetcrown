import { ImageResponse } from "next/og";
import { APP_NAME, APP_TAGLINE, APP_DESCRIPTION } from "@/config/brand";

// Next.js file-convention OG image: served at /opengraph-image and auto-picked
// up by the framework when the root layout's `openGraph` block is set.
// 1200×630 is the canonical Facebook/Slack/Twitter card size (1.91:1 ratio).

export const runtime = "edge";
export const alt = APP_DESCRIPTION;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          background: "#0a0a0a",
          color: "#ededed",
          padding: "80px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Brand mark — control window geometry (must match BrandMark.tsx + public/icon.svg) */}
        <svg width="120" height="120" viewBox="0 0 512 512" style={{ marginBottom: 48 }}>
          <rect width="512" height="512" rx="96" fill="#0a0a0a" />
          <g transform="translate(116 116) scale(11.6667)" fill="none" stroke="#ededed" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="5" width="16" height="14" rx="4" stroke="#ededed" strokeWidth="1.3" opacity="0.95" />
            <path d="M12 7V17" stroke="#ededed" strokeWidth="1.3" opacity="0.9" />
            <path d="M7 12H10" stroke="#ededed" strokeWidth="1.3" opacity="0.75" />
            <path d="M14 12H17" stroke="#ededed" strokeWidth="1.3" opacity="0.75" />
            <path d="M8 8.5H16" stroke="#ededed" strokeWidth="1.1" opacity="0.6" />
          </g>
        </svg>

        <div
          style={{
            fontSize: 96,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            lineHeight: 1,
          }}
        >
          {APP_NAME}
        </div>
        <div
          style={{
            marginTop: 24,
            fontSize: 36,
            color: "#a1a1aa",
            lineHeight: 1.2,
            maxWidth: 900,
          }}
        >
          {APP_TAGLINE}
        </div>
      </div>
    ),
    { ...size },
  );
}
