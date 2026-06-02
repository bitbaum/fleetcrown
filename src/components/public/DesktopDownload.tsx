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
    <div className="bg-black text-white border-t border-white/10 py-20">
      <div className="mx-auto max-w-[720px] px-6">
        <div className="text-center mb-10">
          <div className="text-[10px] font-mono tracking-[3.5px] text-white/40 mb-3">{DESKTOP_DOWNLOAD.eyebrow}</div>
          <h2 className="text-[56px] leading-[0.96] font-semibold tracking-[-2.2px] mb-3">
            {DESKTOP_DOWNLOAD.title}
          </h2>
          <p className="text-lg text-white/60 max-w-sm mx-auto">
            {DESKTOP_DOWNLOAD.lede}
          </p>
        </div>

        {/* x.ai style massive primary action */}
        <div className="flex justify-center mb-6">
          <a
            href={selected.url}
            className="inline-flex items-center rounded-full bg-white px-9 py-[17px] text-[17px] font-medium text-black hover:bg-[#ff5c00] hover:text-white transition-colors"
          >
            Download for {selected.label} <span className="ml-2 text-xs text-black/50 group-hover:text-white/60">({selected.note})</span>
          </a>
        </div>

        <p className="text-center text-xs text-white/40 tracking-widest mb-8">{DESKTOP_DOWNLOAD.note}</p>

        {/* Clean platform switcher */}
        <div className="flex justify-center gap-1.5 mb-12">
          {DESKTOP_DOWNLOAD.platforms.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p)}
              className={`text-xs tracking-[1.5px] px-4 py-1.5 rounded-full border transition-all ${
                selected.id === p.id 
                  ? 'border-white bg-white text-black' 
                  : 'border-white/20 hover:border-white/40 text-white/70 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Very understated fallback */}
        <div className="border-t border-white/10 pt-9 text-center text-sm">
          <div className="text-white/50 mb-1">{DESKTOP_DOWNLOAD.fallback.label}</div>
          <p className="text-white/40 text-xs max-w-xs mx-auto mb-4">{DESKTOP_DOWNLOAD.fallback.description}</p>
          <code className="font-mono text-xs bg-white/5 border border-white/10 px-3 py-1.5 rounded text-white/70 inline-block">
            {DESKTOP_DOWNLOAD.fallback.command}
          </code>

          <div className="mt-8 text-[10px] text-white/40">
            Build now: <span className="font-mono text-white/60">{DESKTOP_DOWNLOAD.buildFromSource.steps}</span>
          </div>
        </div>
      </div>

      <p className="text-center text-white/40 text-xs mt-16 tracking-wide max-w-xs mx-auto">
        The desktop app connects using the same tokens. Web = remote control.
      </p>
    </div>
  );
}
