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

async function displayOnce(tag, summary, display) {
  if (!tag) return display();
  const now = Date.now();
  const keys = [[tag, 86400000]];
  if (summary) keys.push([summary, 90000]);
  for (const [id, at] of shownEvents) if (now - at >= 86400000) shownEvents.delete(id);
  let receipts = [], hashes = [], cache;
  const path = "/__hub_push_receipts";
  try {
    hashes = await Promise.all(keys.map(async ([id]) => {
      const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(id));
      return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2,"0")).join("");
    }));
    cache = await caches.open("hub-push-event-receipts-v1");
    const saved = await cache.match(path);
    if (saved) receipts = (await saved.json()).filter(entry => now - entry[1] < 86400000);
  } catch { /* Fall back to this worker's in-memory receipts. */ }
  const recent = keys.map(([id, ttl], i) => now - (shownEvents.get(id) || 0) < ttl ||
    receipts.some(([h, at]) => h === hashes[i] && now - at < ttl));
  if (recent[0]) return;
  if (!recent[1]) await display();
  // Remember even a grouped event so its retry cannot ring later.
  for (let i = 0; i < keys.length; i++) {
    if (recent[i]) continue;
    shownEvents.set(keys[i][0], now);
    if (hashes[i]) receipts.push([hashes[i],now]);
  }
  while (shownEvents.size > 512) shownEvents.delete(shownEvents.keys().next().value);
  if (cache && hashes.length) {
    try { await cache.put(path, new Response(JSON.stringify(receipts.slice(-512)))); } catch {}
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

  // A route editor may save one assignment per rider at the same school.
  const groupable = tag.startsWith("transport-assignment:") ||
    (title === "Transportation update" && body === "A transportation route was changed. Open The Hub to review the current route.");
  const summary = groupable ? JSON.stringify(["route-summary",title,body,href]) : null;
  const delivery = bannerQueue.then(() => displayOnce(payload.tag, summary, () => self.registration.showNotification(title, {
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
