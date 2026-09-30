type NativeHubBridge = {
  platform?: string;
  version?: string;
  bundleId?: string;
  pushEnvironment?: "production" | "sandbox";
  requestPushNotifications?: () => void;
};

function nativeBridge() {
  if (typeof window === "undefined") return null;
  const nativeWindow = window as typeof window & { __TCS_NATIVE_APP__?: NativeHubBridge };
  return nativeWindow.__TCS_NATIVE_APP__ ?? null;
}

export function isNativeHubApp() {
  return Boolean(nativeBridge());
}

export function isStandaloneHubApp() {
  if (typeof window === "undefined") return false;
  if (isNativeHubApp()) return true;
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

async function registerNativePush(accessToken: string) {
  const bridge = nativeBridge();
  if (!bridge?.requestPushNotifications) {
    return {
      ok: false,
      permission: "unsupported" as const,
      reason: "The native notification bridge is unavailable in this build.",
    };
  }

  const tokenEvent = await new Promise<{
    deviceToken?: string;
    environment?: "production" | "sandbox";
    bundleId?: string;
    appVersion?: string;
    error?: string;
  }>((resolve) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("tcs-native-push-token", listener as EventListener);
      resolve({ error: "The iPhone did not return a notification token." });
    }, 15000);

    const listener = (event: Event) => {
      window.clearTimeout(timeout);
      window.removeEventListener("tcs-native-push-token", listener as EventListener);
      resolve((event as CustomEvent).detail || {});
    };

    window.addEventListener("tcs-native-push-token", listener as EventListener, { once: true });
    bridge.requestPushNotifications?.();
  });

  if (!tokenEvent.deviceToken) {
    return {
      ok: false,
      permission: "denied" as const,
      reason: tokenEvent.error || "Notification permission was not granted.",
    };
  }

  const response = await fetch("/api/notifications/native-subscription", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      deviceToken: tokenEvent.deviceToken,
      environment: tokenEvent.environment || bridge.pushEnvironment || "production",
      bundleId: tokenEvent.bundleId || bridge.bundleId || "com.thomasonchildcaresolutions.thehub",
      appVersion: tokenEvent.appVersion || bridge.version || "1.0.0",
    }),
  });

  const result = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) {
    return {
      ok: false,
      permission: "denied" as const,
      reason: result.error || "The native notification device could not be registered.",
    };
  }

  return { ok: true, permission: "granted" as const, reason: "" };
}

export async function enableHubPushNotifications(accessToken: string) {
  if (isNativeHubApp()) {
    return registerNativePush(accessToken);
  }
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
