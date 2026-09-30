import "server-only";

import { connect } from "node:http2";
import { createHash, createPrivateKey, sign } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";

const NATIVE_PUSH_KEY = "tcs_native_push_devices";
const MAX_NATIVE_PUSH_DEVICES = 8;

export type NativePushRegistration = {
  id: string;
  platform: "ios";
  deviceToken: string;
  environment: "production" | "sandbox";
  bundleId: string;
  appVersion: string;
  createdAt: string;
  lastSeenAt: string;
};

function base64Url(value: Buffer | string) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return buffer.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function nativeDeviceId(token: string) {
  return createHash("sha256").update(token.toLowerCase()).digest("hex").slice(0, 24);
}

export function parseNativePushRegistrations(user: User): NativePushRegistration[] {
  const raw = user.app_metadata?.[NATIVE_PUSH_KEY];
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((item): item is NativePushRegistration => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as NativePushRegistration;
      return candidate.platform === "ios"
        && /^[a-f0-9]{64,256}$/i.test(candidate.deviceToken)
        && (candidate.environment === "production" || candidate.environment === "sandbox")
        && typeof candidate.bundleId === "string";
    })
    .slice(0, MAX_NATIVE_PUSH_DEVICES);
}

export async function saveNativePushRegistrations(
  admin: SupabaseClient,
  user: User,
  registrations: NativePushRegistration[],
) {
  const appMetadata = { ...(user.app_metadata ?? {}) };
  appMetadata[NATIVE_PUSH_KEY] = registrations.slice(0, MAX_NATIVE_PUSH_DEVICES);
  const { error } = await admin.auth.admin.updateUserById(user.id, { app_metadata: appMetadata });
  if (error) throw new Error(error.message);
}

export function upsertNativePushRegistration(args: {
  current: NativePushRegistration[];
  deviceToken: string;
  environment: "production" | "sandbox";
  bundleId: string;
  appVersion: string;
}) {
  const now = new Date().toISOString();
  const existing = args.current.find((item) => item.deviceToken === args.deviceToken);

  const next: NativePushRegistration = {
    id: existing?.id || nativeDeviceId(args.deviceToken),
    platform: "ios",
    deviceToken: args.deviceToken.toLowerCase(),
    environment: args.environment,
    bundleId: args.bundleId,
    appVersion: args.appVersion,
    createdAt: existing?.createdAt || now,
    lastSeenAt: now,
  };

  return [next, ...args.current.filter((item) => item.deviceToken !== args.deviceToken)]
    .slice(0, MAX_NATIVE_PUSH_DEVICES);
}

function apnsConfig() {
  const teamId = process.env.APPLE_TEAM_ID?.trim() || "";
  const keyId = process.env.APPLE_KEY_ID?.trim() || "";
  const privateKey = (process.env.APPLE_APNS_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
  const bundleId = process.env.APPLE_BUNDLE_ID?.trim() || "com.thomasonchildcaresolutions.thehub";

  if (!teamId || !keyId || !privateKey) {
    return null;
  }

  return { teamId, keyId, privateKey, bundleId };
}

export function nativePushServerReady() {
  return Boolean(apnsConfig());
}

function providerToken(config: NonNullable<ReturnType<typeof apnsConfig>>) {
  const header = base64Url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const claims = base64Url(JSON.stringify({
    iss: config.teamId,
    iat: Math.floor(Date.now() / 1000),
  }));
  const unsigned = `${header}.${claims}`;

  const key = createPrivateKey({
    key: config.privateKey,
    format: "pem",
  });

  const signature = sign("sha256", Buffer.from(unsigned), {
    key,
    dsaEncoding: "ieee-p1363",
  });

  return `${unsigned}.${base64Url(signature)}`;
}

export async function sendApplePush(
  registration: NativePushRegistration,
  payload: {
    title: string;
    body: string;
    href: string;
    tag: string;
  },
) {
  const config = apnsConfig();
  if (!config) {
    return { ok: false, status: 0, stale: false, unavailable: true };
  }

  const host = registration.environment === "sandbox"
    ? "https://api.sandbox.push.apple.com"
    : "https://api.push.apple.com";

  const client = connect(host);
  const token = providerToken(config);
  const body = JSON.stringify({
    aps: {
      alert: {
        title: payload.title,
        body: payload.body,
      },
      sound: "default",
      "thread-id": "tcs-hub",
    },
    href: payload.href.startsWith("/") ? payload.href : "/notifications",
    tag: payload.tag,
  });

  return await new Promise<{ ok: boolean; status: number; stale: boolean; unavailable: boolean }>((resolve) => {
    let status = 0;
    let responseBody = "";

    client.on("error", () => {
      client.close();
      resolve({ ok: false, status, stale: false, unavailable: false });
    });

    const request = client.request({
      ":method": "POST",
      ":path": `/3/device/${registration.deviceToken}`,
      authorization: `bearer ${token}`,
      "apns-topic": registration.bundleId || config.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": "0",
      "content-type": "application/json",
    });

    request.setEncoding("utf8");
    request.on("response", (headers) => {
      status = Number(headers[":status"] || 0);
    });
    request.on("data", (chunk) => {
      responseBody += chunk;
    });
    request.on("end", () => {
      client.close();
      const stale = status === 410 || (status === 400 && /BadDeviceToken|DeviceTokenNotForTopic|Unregistered/i.test(responseBody));
      resolve({
        ok: status === 200,
        status,
        stale,
        unavailable: false,
      });
    });
    request.on("error", () => {
      client.close();
      resolve({ ok: false, status, stale: false, unavailable: false });
    });

    request.end(body);
  });
}
