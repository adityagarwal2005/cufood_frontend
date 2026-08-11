// Web Push service worker — only handles push notifications and taps on
// them. Deliberately does NOT do any asset caching/offline support: this
// app is a live order-tracking tool, showing stale cached data offline
// would be actively misleading (e.g. an old order status), so there's no
// upside to it here.

self.addEventListener("push", (event) => {
  let data = { title: "CUFood", body: "Your order status changed.", url: "/my-orders.html" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (err) {
    // Non-JSON payload — fall back to the defaults above rather than fail silently.
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url },
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
      const absoluteUrl = new URL(targetUrl, self.location.origin).href;
      const existing = allClients.find((c) => c.url === absoluteUrl);
      if (existing) {
        return existing.focus();
      }
      return clients.openWindow(absoluteUrl);
    })()
  );
});
