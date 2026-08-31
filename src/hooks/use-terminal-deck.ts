"use client";

import { useCallback } from "react";
import { useLocalStorageState } from "@/hooks/use-local-storage-state";
import { useIsNarrow } from "@/hooks/use-is-narrow";
import { TERMINAL_DECK_STORAGE_KEY } from "@/config/terminal-keys";

type DeckPrefs = {
  /**
   * null = follow the device. A phone types into the composer (the terminal
   * canvas is a poor focus target and autocorrect mangles shell words); a
   * laptop types straight into the session, which is what a terminal is. Both
   * are right for their device, so a stored value only exists once someone has
   * actually disagreed with their device's default.
   */
  liveKeys: boolean | null;
};

const DEFAULTS: DeckPrefs = { liveKeys: null };

// Module scope keeps these stable across renders — useLocalStorageState holds
// them in effect dependency arrays.
const serialize = (p: DeckPrefs) => JSON.stringify(p);
const deserialize = (raw: string): DeckPrefs => {
  try {
    const parsed = JSON.parse(raw) as Partial<DeckPrefs>;
    return { liveKeys: parsed.liveKeys ?? DEFAULTS.liveKeys };
  } catch {
    return DEFAULTS;
  }
};

/** How the key deck behaves: whether keystrokes go to the terminal canvas or to
 *  the dock's composer, with the device's answer as the default. */
export function useTerminalDeck() {
  const narrow = useIsNarrow();
  const [prefs, setPrefs] = useLocalStorageState<DeckPrefs>(
    TERMINAL_DECK_STORAGE_KEY,
    DEFAULTS,
    serialize,
    deserialize,
  );

  const setLiveKeys = useCallback((value: boolean) => setPrefs({ liveKeys: value }), [setPrefs]);

  return { liveKeys: prefs.liveKeys ?? !narrow, setLiveKeys };
}
