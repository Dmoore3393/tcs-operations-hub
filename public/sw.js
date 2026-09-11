/* The Hub service worker intentionally does not cache private child/staff data.
   Installed app pages stay network-backed so website deployments remain the source of truth. */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request));
});


self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = typeof payload.title === "string" && payload.title ? payload.title : "The Hub";
  const body = typeof payload.body === "string" ? payload.body : "You have a new Hub notification.";
  const href = typeof payload.href === "string" && payload.href.startsWith("/") ? payload.href : "/notifications";
  const tag = typeof payload.tag === "string" && payload.tag ? payload.tag : "tcs-hub-notification";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/app-icon-192.png",
      badge: "/app-icon-192.png",
      tag,
      data: { href },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification?.data?.href || "/notifications";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(href);
          return client.focus();
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(href) : undefined;
    }),
  );
});
