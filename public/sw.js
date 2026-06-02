/**
 * FleetCrown service worker — handles Web Push events.
 *
 * Scope: root ("/") so notifications fire regardless of which app page is open
 * (or none — that's the point of background push).
 *
 * Two events:
 *  - "push"             — show the OS notification using the payload body
 *  - "notificationclick" — bring an open tab to focus, or open one at the URL
 */

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = { title: "FleetCrown", body: "Agent update", url: "/control", tag: "fleetcrown" };
  if (event.data) {
    try { data = { ...data, ...event.data.json() }; }
    catch { data.body = event.data.text() || data.body; }
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:  data.body,
      tag:   data.tag,
      data:  { url: data.url },
      // Coalesce same-tag notifications instead of stacking; the user only
      // needs to see the latest state for a given tab.
      renotify: false,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  const url = event.notification.data?.url || "/control";
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // Focus a FleetCrown tab if one's already open; navigate it to the target.
    for (const client of all) {
      try {
        const u = new URL(client.url);
        if (u.origin === self.location.origin) {
          await client.focus();
          if ("navigate" in client) await client.navigate(url);
          return;
        }
      } catch { /* ignore */ }
    }
    await self.clients.openWindow(url);
  })());
});
