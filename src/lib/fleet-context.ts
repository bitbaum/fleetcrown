export const FLEET_PROJECT_STORAGE_KEY = "fleetcrown:active-project";
export const FLEET_PROJECT_EVENT = "fleetcrown:project-context";

export type FleetSurfaceId = "chat" | "control" | "terminal";

export function fleetSurfaceHref(surface: FleetSurfaceId, project: string | null): string {
  const value = project?.trim();
  if (!value) {
    if (surface === "chat") return "/loki";
    if (surface === "control") return "/control";
    return "/terminal";
  }

  const encoded = encodeURIComponent(value);
  if (surface === "chat") return `/loki?project=${encoded}`;
  if (surface === "control") return `/control?focus=${encoded}`;
  return `/terminal?source=server&tab=${encoded}`;
}

export function projectFromFleetRoute(pathname: string, search: URLSearchParams): string | null {
  const value = pathname.startsWith("/loki")
    ? search.get("project")
    : pathname.startsWith("/control")
      ? search.get("focus")
      : pathname.startsWith("/terminal")
        ? search.get("tab")
        : null;
  return value?.trim() || null;
}

export function readRememberedFleetProject(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(FLEET_PROJECT_STORAGE_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

export function rememberFleetProject(project: string | null): void {
  if (typeof window === "undefined") return;
  const value = project?.trim() || null;
  try {
    if (value) window.localStorage.setItem(FLEET_PROJECT_STORAGE_KEY, value);
    else window.localStorage.removeItem(FLEET_PROJECT_STORAGE_KEY);
  } catch {
    // The tabs still work for the current route when storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent(FLEET_PROJECT_EVENT, { detail: { project: value } }));
}
