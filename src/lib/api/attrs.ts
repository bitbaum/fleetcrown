const JSON_HEADERS = { "Content-Type": "application/json" };

/** Upsert an entity attribute via POST /api/<entity>/<id>/attrs */
export function setAttr(entityBaseUrl: string, key: string, value: string) {
  return fetch(`${entityBaseUrl}/attrs`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ key, value }),
  });
}

/** Delete an entity attribute via DELETE /api/<entity>/<id>/attrs */
export function removeAttr(entityBaseUrl: string, key: string) {
  return fetch(`${entityBaseUrl}/attrs`, {
    method: "DELETE",
    headers: JSON_HEADERS,
    body: JSON.stringify({ key }),
  });
}
