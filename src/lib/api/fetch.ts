const JSON_HEADERS = { "Content-Type": "application/json" };

/** GET a JSON endpoint and return the parsed response. Throws on non-2xx. */
export async function getJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * Thin wrappers around fetch() for the common JSON-body cases. Exists so
 * the `{ method, headers: { "Content-Type": "application/json" }, body:
 * JSON.stringify(...) }` boilerplate doesn't have to be repeated in every
 * component that calls a write endpoint.
 *
 *   await postJson("/api/people", { name, description });
 *   await patchJson(`/api/habits/${id}`, { done: true });
 *   await deleteJson(`/api/events/${id}`);
 */
export function postJson(url: string, body: unknown) {
  return fetch(url, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });
}

export function patchJson(url: string, body: unknown) {
  return fetch(url, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(body) });
}

export function deleteJson(url: string, body?: unknown) {
  if (body === undefined) return fetch(url, { method: "DELETE" });
  return fetch(url, { method: "DELETE", headers: JSON_HEADERS, body: JSON.stringify(body) });
}
