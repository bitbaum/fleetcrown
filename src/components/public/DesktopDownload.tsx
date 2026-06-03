"use client";

import { useState, useSyncExternalStore } from "react";
import { DESKTOP_DOWNLOAD } from "@/config/marketing-content";

type Platform = (typeof DESKTOP_DOWNLOAD.platforms)[number];

function detectPlatformId(): Platform["id"] {
  if (typeof navigator === "undefined") return DESKTOP_DOWNLOAD.platforms[0].id;
  const ua = navigator.userAgent.toLowerCase();
  const platform = navigator.platform?.toLowerCase() || "";
  if (platform.includes("linux") || ua.includes("linux")) return "linux";
  if (platform.includes("win") || ua.includes("windows")) return "win";
  if (platform.includes("mac") || ua.includes("mac")) return "mac";
  return DESKTOP_DOWNLOAD.platforms[0].id;
}

function subscribePlatform(onStoreChange: () => void) {
  const timer = window.setTimeout(onStoreChange, 0);
  return () => window.clearTimeout(timer);
}

function getClientPlatformId() {
  return detectPlatformId();
}

function getServerPlatformId(): Platform["id"] {
  return DESKTOP_DOWNLOAD.platforms[0].id;
}

export function DesktopDownload() {
  const detectedPlatformId = useSyncExternalStore(subscribePlatform, getClientPlatformId, getServerPlatformId);
  const [selectedPlatformId, setSelectedPlatformId] = useState<Platform["id"] | null>(null);
  const activePlatformId = selectedPlatformId ?? detectedPlatformId;
  const active =
    DESKTOP_DOWNLOAD.platforms.find((platform) => platform.id === activePlatformId) ?? DESKTOP_DOWNLOAD.platforms[0];

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
        <div className="flex flex-col items-center gap-3 mb-6">
          <a href={active.url} className="ui-public-download-cta group">
            {active.id === "linux" ? "Download AppImage" : `Build for ${active.label}`}
            <span className="ui-public-download-cta-note">({active.note})</span>
          </a>
          {active.secondary.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2">
              {active.secondary.map((download) => (
                <a key={download.url} href={download.url} className="ui-public-download-secondary">
                  {download.label}
                </a>
              ))}
            </div>
          )}
        </div>

        <p className="ui-public-download-note">{DESKTOP_DOWNLOAD.note}</p>

        {/* Clean platform switcher */}
        <div className="ui-public-download-platform-bar">
          {DESKTOP_DOWNLOAD.platforms.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedPlatformId(p.id)}
              className={`ui-public-download-platform ${active.id === p.id ? 'ui-public-download-platform-active' : 'ui-public-download-platform-idle'}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="ui-public-download-command">
          <span>After download</span>
          <code>{active.command}</code>
        </div>

        <div className="ui-public-download-prereqs">
          <div className="ui-public-download-prereqs-heading">Required local tools</div>
          <div className="grid gap-3">
            {DESKTOP_DOWNLOAD.prerequisites.map((item) => (
              <div key={item.title} className="ui-public-download-prereq-card">
                <div>
                  <div className="ui-public-download-prereq-title">{item.title}</div>
                  <div className="ui-public-download-prereq-role">{item.role}</div>
                </div>
                <p>{item.description}</p>
                <code>{item.command}</code>
                <a href={item.primary.href} className="ui-public-download-prereq-link">
                  {item.primary.label} →
                </a>
              </div>
            ))}
          </div>
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
