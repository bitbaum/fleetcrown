import { postJson, deleteJson } from "./fetch";

/** Upsert an entity attribute via POST /api/<entity>/<id>/attrs */
export function setAttr(entityBaseUrl: string, key: string, value: string) {
  return postJson(`${entityBaseUrl}/attrs`, { key, value });
}

/** Delete an entity attribute via DELETE /api/<entity>/<id>/attrs */
export function removeAttr(entityBaseUrl: string, key: string) {
  return deleteJson(`${entityBaseUrl}/attrs`, { key });
}
