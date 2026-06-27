"use client";

import { useSearchParams } from "next/navigation";
import { TerminalMobileShell } from "@/components/terminal/TerminalMobileShell";
import { TerminalSurface } from "@/components/terminal/TerminalSurface";

/** Client boundary for /terminal — owns mobile expand state and URL deep links. */
export function TerminalPageClient({ local }: { local: boolean }) {
  const searchParams = useSearchParams();
  const sourceParam = searchParams.get("source");
  const initialSource =
    sourceParam === "machine" ? "machine" as const
    : sourceParam === "server" ? "server" as const
    : undefined;
  const initialTab = searchParams.get("tab");
  const surfaceKey = `${initialSource ?? "server"}:${initialTab ?? ""}`;

  return (
    <TerminalMobileShell>
      {({ immersive }) => (
        <TerminalSurface
          key={surfaceKey}
          local={local}
          immersive={immersive}
          initialSource={initialSource}
          initialTab={initialTab}
        />
      )}
    </TerminalMobileShell>
  );
}
