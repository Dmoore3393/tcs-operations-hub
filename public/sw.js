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


// Store only hashes of recently displayed event IDs, never message text or child details.
const shownEvents = new Map();
let bannerQueue = Promise.resolve();

async function displayOnce(tag, display) {
  if (!tag) return display();
  const cutoff = Date.now() - 86400000;
  for (const [id, at] of shownEvents) if (at < cutoff) shownEvents.delete(id);
  if (shownEvents.has(tag)) return;
  let cache, receipts = [], hash;
  const key = "/__hub_push_receipts";
  try {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(tag));
    hash = Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2,"0")).join("");
    cache = await caches.open("hub-push-event-receipts-v1");
    const saved = await cache.match(key);
    if (saved) receipts = (await saved.json()).filter(entry => entry[1] >= cutoff);
    if (receipts.some(entry => entry[0] === hash)) return;
  } catch { /* Storage can be unavailable on a phone. Still deliver the alert. */ }
  await display();
  shownEvents.set(tag, Date.now());
  if (shownEvents.size > 512) shownEvents.delete(shownEvents.keys().next().value);
  if (cache && hash) {
    receipts.push([hash, Date.now()]);
    try { await cache.put(key, new Response(JSON.stringify(receipts.slice(-512)))); } catch {}
  }
}

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

  const delivery = bannerQueue.then(() => displayOnce(payload.tag, () => self.registration.showNotification(title, {
      body,
      icon: "/app-icon-192.png",
      badge: "/app-icon-192.png",
      tag,
      data: { href },
    })));
  bannerQueue = delivery.catch(() => {});
  event.waitUntil(delivery);
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
