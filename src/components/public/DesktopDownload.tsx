"use client";

import { useState } from "react";
import { DESKTOP_DOWNLOAD } from "@/config/marketing-content";

type Platform = (typeof DESKTOP_DOWNLOAD.platforms)[number];

function getPlatform(): string {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  const platform = navigator.platform?.toLowerCase() || "";

  if (/mac/i.test(platform) || /mac/i.test(ua)) return "mac";
  if (/win/i.test(platform) || /win/i.test(ua)) return "win";
  if (/linux/i.test(platform) || /linux/i.test(ua)) return "linux";
  return "other";
}

function getInitialPlatform(): Platform {
  if (typeof window === "undefined") return DESKTOP_DOWNLOAD.platforms[0];
  const p = getPlatform();
  return DESKTOP_DOWNLOAD.platforms.find((pl) => pl.id === p) ?? DESKTOP_DOWNLOAD.platforms[0];
}

export function DesktopDownload() {
  const [selected, setSelected] = useState<Platform>(getInitialPlatform);

  return (
    <div className="ui-public-download">
      <div className="mx-auto max-w-[720px] px-6">
        <div className="text-center mb-10">
          <div className="ui-public-download-eyebrow">{DESKTOP_DOWNLOAD.eyebrow}</div>
          <h2 className="ui-public-download-title">
            {DESKTOP_DOWNLOAD.title}
          </h2>
          <p className="ui-public-download-lede">
            {DESKTOP_DOWNLOAD.lede}
          </p>
        </div>

        {/* x.ai style massive primary action */}
        <div className="flex justify-center mb-6">
          <a href={selected.url} className="ui-public-download-cta group">
            Download for {selected.label} <span className="ui-public-download-cta-note">({selected.note})</span>
          </a>
        </div>

        <p className="ui-public-download-note">{DESKTOP_DOWNLOAD.note}</p>

        {/* Clean platform switcher */}
        <div className="ui-public-download-platform-bar">
          {DESKTOP_DOWNLOAD.platforms.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p)}
              className={`ui-public-download-platform ${selected.id === p.id ? 'ui-public-download-platform-active' : 'ui-public-download-platform-idle'}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Very understated fallback */}
        <div className="ui-public-download-fallback">
          <div className="ui-public-download-fallback-label">{DESKTOP_DOWNLOAD.fallback.label}</div>
          <p className="ui-public-download-fallback-desc">{DESKTOP_DOWNLOAD.fallback.description}</p>
          <code className="ui-public-download-fallback-code">
            {DESKTOP_DOWNLOAD.fallback.command}
          </code>

          <div className="ui-public-download-build">
            Build now: <span className="ui-public-download-build-step">{DESKTOP_DOWNLOAD.buildFromSource.steps}</span>
          </div>
        </div>

        {/* Future platform promises — explicit, honest, from first principles (user asked for Android/iOS + "apps for you know" i.e. full desktop + mobile) */}
        {DESKTOP_DOWNLOAD.future && (
          <div className="mt-8 text-left text-xs text-text-secondary border-t border-border-subtle pt-4">
            <div className="font-medium text-text-primary mb-1 tracking-[0.5px]">Coming to more surfaces</div>
            <div>Desktop: {DESKTOP_DOWNLOAD.future.desktop}</div>
            <div className="mt-1">Mobile: {DESKTOP_DOWNLOAD.future.mobile}</div>
            {DESKTOP_DOWNLOAD.future.other && <div className="mt-1 opacity-80">{DESKTOP_DOWNLOAD.future.other}</div>}
          </div>
        )}
      </div>

      <p className="ui-public-download-footer">
        The desktop app connects using the same tokens. Web = remote control. Mobile coming.
      </p>
    </div>
  );
}
