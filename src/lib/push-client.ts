export function isStandaloneHubApp() {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || Boolean(nav.standalone);
}

function applicationServerKey(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = window.atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function enableHubPushNotifications(accessToken: string) {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    return { ok: false, permission: "unsupported" as const, reason: "Notifications are not supported on this device." };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, permission, reason: "Notification permission was not granted." };
  }

  const registration = await navigator.serviceWorker.ready;
  if (!("pushManager" in registration)) {
    return { ok: false, permission, reason: "Background push is not supported by this installed app/browser." };
  }

  const configResponse = await fetch("/api/notifications/subscription", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!configResponse.ok) {
    return { ok: false, permission, reason: "Could not prepare secure push notifications." };
  }

  const config = await configResponse.json() as { publicKey?: string };
  if (!config.publicKey) {
    return { ok: false, permission, reason: "The notification public key is unavailable." };
  }

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(config.publicKey),
    });
  }

  const saveResponse = await fetch("/api/notifications/subscription", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(subscription.toJSON()),
  });

  if (!saveResponse.ok) {
    return { ok: false, permission, reason: "The device subscription could not be saved." };
  }

  return { ok: true, permission, reason: "" };
}
