"use client";

import { useState, useEffect } from "react";
import { Loader2, MapPin, Navigation, X } from "lucide-react";
import { patchJson } from "@/lib/api/fetch";
import type { UserPreferencesData } from "@/db/queries/user-preferences";

const LOCALE_OPTIONS: { value: string; label: string }[] = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "en-AU", label: "English (AU)" },
  { value: "en-CA", label: "English (CA)" },
  { value: "de-CH", label: "Deutsch (Schweiz)" },
  { value: "de-DE", label: "Deutsch (Deutschland)" },
  { value: "de-AT", label: "Deutsch (Österreich)" },
  { value: "fr-FR", label: "Français (France)" },
  { value: "fr-CH", label: "Français (Suisse)" },
  { value: "es-ES", label: "Español (España)" },
  { value: "es-MX", label: "Español (México)" },
  { value: "it-IT", label: "Italiano (Italia)" },
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "ja-JP", label: "日本語" },
  { value: "zh-CN", label: "中文 (简体)" },
  { value: "ko-KR", label: "한국어" },
];

const TIMEZONES = Intl.supportedValuesOf("timeZone");

type Props = { initialPrefs: UserPreferencesData };

export function LocationSettings({ initialPrefs }: Props) {
  // Home base
  const [homeCity,     setHomeCity]     = useState(initialPrefs.homeCity ?? "");
  const [homeTimezone, setHomeTimezone] = useState(initialPrefs.homeTimezone ?? "");
  const [homeLocale,   setHomeLocale]   = useState(initialPrefs.homeLocale ?? "");
  const [homeSaving,   setHomeSaving]   = useState(false);
  const [homeError,    setHomeError]    = useState("");
  const [homeSaved,    setHomeSaved]    = useState(false);

  // Current location
  const [currentCity,      setCurrentCity]      = useState(initialPrefs.currentCity ?? "");
  const [currentTimezone,  setCurrentTimezone]  = useState(initialPrefs.currentTimezone ?? "");
  const [currentCityUntil, setCurrentCityUntil] = useState(initialPrefs.currentCityUntil ?? "");
  const [currentSaving,    setCurrentSaving]    = useState(false);
  const [currentError,     setCurrentError]     = useState("");
  const [currentSaved,     setCurrentSaved]     = useState(false);

  const isCurrentExpired =
    !!initialPrefs.currentCity &&
    !!initialPrefs.currentCityUntil &&
    new Date(initialPrefs.currentCityUntil) < new Date();

  const homeDirty =
    homeCity !== (initialPrefs.homeCity ?? "") ||
    homeTimezone !== (initialPrefs.homeTimezone ?? "") ||
    homeLocale !== (initialPrefs.homeLocale ?? "");

  const currentDirty =
    currentCity !== (initialPrefs.currentCity ?? "") ||
    currentTimezone !== (initialPrefs.currentTimezone ?? "") ||
    currentCityUntil !== (initialPrefs.currentCityUntil ?? "");

  const saveHome = async () => {
    setHomeSaving(true);
    setHomeError("");
    setHomeSaved(false);
    try {
      const res = await patchJson("/api/me/preferences", {
        homeCity: homeCity.trim() || null,
        homeTimezone: homeTimezone || null,
        homeLocale: homeLocale || null,
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setHomeError(d.error ?? "Failed to save");
        return;
      }
      setHomeSaved(true);
      setTimeout(() => setHomeSaved(false), 3000);
    } catch {
      setHomeError("Network error — try again");
    } finally {
      setHomeSaving(false);
    }
  };

  const saveCurrent = async () => {
    setCurrentSaving(true);
    setCurrentError("");
    setCurrentSaved(false);
    try {
      const res = await patchJson("/api/me/preferences", {
        currentCity: currentCity.trim() || null,
        currentTimezone: currentTimezone || null,
        currentCityUntil: currentCityUntil || null,
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setCurrentError(d.error ?? "Failed to save");
        return;
      }
      setCurrentSaved(true);
      setTimeout(() => setCurrentSaved(false), 3000);
    } catch {
      setCurrentError("Network error — try again");
    } finally {
      setCurrentSaving(false);
    }
  };

  const clearCurrent = async () => {
    setCurrentCity("");
    setCurrentTimezone("");
    setCurrentCityUntil("");
    setCurrentSaving(true);
    try {
      await patchJson("/api/me/preferences", { currentCity: null, currentTimezone: null, currentCityUntil: null });
    } finally {
      setCurrentSaving(false);
    }
  };

  const hasCurrentLocation = !!(initialPrefs.currentCity && !isCurrentExpired);

  return (
    <section className="ui-settings-section">
      <h2 className="font-medium text-text-primary">Location</h2>
      <p className="text-sm text-text-secondary -mt-1">
        Your location powers weather, event recommendations, and scheduling defaults.
        Set a home base and optionally override it when traveling.
      </p>

      {/* Home base */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-text-muted shrink-0" />
          <h3 className="text-sm font-medium text-text-primary">Home base</h3>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="ui-kicker">City</label>
            <input
              value={homeCity}
              onChange={(e) => setHomeCity(e.target.value)}
              className="ui-input"
              placeholder="e.g. Zurich, New York, Tokyo"
            />
          </div>
          <div className="space-y-1.5">
            <label className="ui-kicker">Timezone</label>
            <select
              value={homeTimezone}
              onChange={(e) => setHomeTimezone(e.target.value)}
              className="ui-input"
            >
              <option value="">Select timezone</option>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="ui-kicker">Date & number format</label>
          <select
            value={homeLocale}
            onChange={(e) => setHomeLocale(e.target.value)}
            className="ui-input sm:max-w-xs"
          >
            <option value="">Select locale</option>
            {LOCALE_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        {homeError && <p className="ui-error-xs">{homeError}</p>}
        {homeSaved && <p className="text-sm text-status-positive">Saved.</p>}
        <button
          onClick={saveHome}
          disabled={homeSaving || !homeDirty}
          className="ui-btn-primary"
        >
          {homeSaving && <Loader2 className="ui-spinner" />}
          Save home base
        </button>
      </div>

      {/* Current location override */}
      <div className="border-t border-border-subtle pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Navigation className="h-4 w-4 text-accent-text shrink-0" />
            <h3 className="text-sm font-medium text-text-primary">
              Currently in
              {hasCurrentLocation && (
                <span className="ml-2 text-xs font-normal text-accent-text">{initialPrefs.currentCity}</span>
              )}
            </h3>
          </div>
          {(hasCurrentLocation || currentCity) && (
            <button
              onClick={clearCurrent}
              disabled={currentSaving}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
              aria-label="Clear current location"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>

        {isCurrentExpired && (
          <p className="flex items-center gap-1.5 text-xs text-status-warning">
            <span className="h-1.5 w-1.5 rounded-full bg-status-warning shrink-0" />
            Location override expired — back to home base
          </p>
        )}

        <p className="text-xs text-text-muted">
          Override your home location while traveling. Set an &ldquo;until&rdquo; date and it reverts automatically.
        </p>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="ui-kicker">City</label>
            <input
              value={currentCity}
              onChange={(e) => setCurrentCity(e.target.value)}
              className="ui-input"
              placeholder="e.g. Bangkok, London, NYC"
            />
          </div>
          <div className="space-y-1.5">
            <label className="ui-kicker">Timezone</label>
            <select
              value={currentTimezone}
              onChange={(e) => setCurrentTimezone(e.target.value)}
              className="ui-input"
            >
              <option value="">Same as home</option>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1.5 sm:max-w-xs">
          <label className="ui-kicker">Until (optional)</label>
          <input
            type="date"
            value={currentCityUntil}
            onChange={(e) => setCurrentCityUntil(e.target.value)}
            min={new Date().toISOString().slice(0, 10)}
            className="ui-input"
          />
        </div>
        {currentError && <p className="ui-error-xs">{currentError}</p>}
        {currentSaved && <p className="text-sm text-status-positive">Saved.</p>}
        <button
          onClick={saveCurrent}
          disabled={currentSaving || !currentDirty}
          className="ui-btn-secondary"
        >
          {currentSaving && <Loader2 className="ui-spinner" />}
          Save current location
        </button>
      </div>
    </section>
  );
}
