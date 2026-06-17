"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { APP_SLUG } from "@/config/brand";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      // Dark-first brand (x.ai / grok / SpaceX language). Users who haven't
      // explicitly picked a theme get dark instead of following the OS — the
      // Settings → Appearance toggle (incl. System) still overrides per-user.
      defaultTheme="dark"
      enableSystem={true}
      storageKey={`${APP_SLUG}-theme`}
    >
      {children}
    </NextThemesProvider>
  );
}
