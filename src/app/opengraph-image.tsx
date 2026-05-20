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
        {/* Brand mark — same crosshair geometry as /icon.svg, scaled. */}
        <svg width="120" height="120" viewBox="0 0 512 512" style={{ marginBottom: 48 }}>
          <rect width="512" height="512" rx="96" fill="#0a0a0a" />
          <g fill="none" stroke="#ededed" strokeWidth="32" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="256" cy="256" r="140" />
            <path d="M256 116 V196 M256 316 V396 M116 256 H196 M316 256 H396" />
          </g>
          <circle cx="256" cy="256" r="28" fill="#ededed" />
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
