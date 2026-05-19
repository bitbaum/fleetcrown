"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { APP_SLUG } from "@/config/brand";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem={true}
      storageKey={`${APP_SLUG}-theme`}
    >
      {children}
    </NextThemesProvider>
  );
}
