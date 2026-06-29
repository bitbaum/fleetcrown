"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

function navigateToLoki(router: ReturnType<typeof useRouter>, pathname: string, prompt?: string) {
  const trimmed = prompt?.trim() ?? "";
  if (pathname === "/loki") {
    window.dispatchEvent(new CustomEvent("loki:prefill", { detail: { prompt: trimmed } }));
    return;
  }
  const q = trimmed ? `?q=${encodeURIComponent(trimmed)}` : "";
  router.push(`/loki${q}`);
}

export function AskLokiButton() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const keyHandler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) return;
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        navigateToLoki(router, pathname);
      }
    };
    window.addEventListener("keydown", keyHandler);
    return () => window.removeEventListener("keydown", keyHandler);
  }, [router, pathname]);

  useEffect(() => {
    const eventHandler = (e: Event) => {
      const prompt = (e as CustomEvent<{ prompt: string }>).detail?.prompt ?? "";
      navigateToLoki(router, pathname, prompt);
    };
    window.addEventListener("loki:open", eventHandler);
    return () => window.removeEventListener("loki:open", eventHandler);
  }, [router, pathname]);

  if (pathname === "/loki") return null;

  return (
    <button
      onClick={() => navigateToLoki(router, pathname)}
      className="ui-fab fixed bottom-7 right-7 z-40 hidden h-14 w-14 items-center justify-center text-xl active:scale-95 md:flex focus-visible:ring-2 focus-visible:ring-accent-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      title="Open Loki (press ?)"
    >
      🌿
    </button>
  );
}
