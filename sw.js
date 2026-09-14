// Web Push service worker — only handles push notifications and taps on
// them. Deliberately does NOT do any asset caching/offline support: this
// app is a live order-tracking tool, showing stale cached data offline
// would be actively misleading (e.g. an old order status), so there's no
// upside to it here.

// Take over as soon as a new version ships. Otherwise an updated worker
// waits until every tab and the installed app are fully closed, which on a
// phone can mean days of running the old one. Safe because this worker
// caches nothing.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = { title: "CUFood", body: "Your order status changed.", url: "/my-orders.html" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (err) {
    // Non-JSON payload — fall back to the defaults above rather than fail silently.
  }

  // A new order is the one alert an outlet cannot miss: three minutes after
  // payment it is declined and refunded. So it stays on screen until it is
  // dealt with, and buzzes harder than a student's status update.
  const isNewOrder = data.kind === "new_order";

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url },
      // One notification per order, updated in place as its status moves
      // on. renotify makes each update alert again instead of silently
      // replacing the last one (and is only valid alongside a tag).
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      requireInteraction: isNewOrder,
      vibrate: isNewOrder ? [400, 150, 400, 150, 800] : [200, 100, 200],
      timestamp: Date.now(),
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data && event.notification.data.url;
  if (!targetUrl) return;

  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
      const target = new URL(targetUrl, self.location.origin);
      // Reuse a window already on that page, even if its query string or
      // hash differs, rather than stacking up duplicates.
      const existing = allClients.find((c) => {
        const url = new URL(c.url);
        return url.pathname === target.pathname && (target.search === "" || url.search === target.search);
      });
      if (existing) {
        return existing.focus();
      }
      return clients.openWindow(target.href);
    })()
  );
});
