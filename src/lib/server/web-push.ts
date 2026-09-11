import "server-only";

import {
  createCipheriv,
  createECDH,
  createHash,
  createHmac,
  createPrivateKey,
  randomBytes,
  sign,
} from "node:crypto";

export type StoredPushSubscription = {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
  createdAt: string;
  lastSeenAt: string;
  userAgent: string;
};

function base64Url(buffer: Buffer) {
  return buffer.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(normalized + padding, "base64");
}

function hmac(key: Buffer, data: Buffer) {
  return createHmac("sha256", key).update(data).digest();
}

function hkdfExtract(salt: Buffer, ikm: Buffer) {
  return hmac(salt, ikm);
}

function hkdfExpand(prk: Buffer, info: Buffer, length: number) {
  let output = Buffer.alloc(0);
  let previous = Buffer.alloc(0);
  let counter = 1;
  while (output.length < length) {
    previous = hmac(prk, Buffer.concat([previous, info, Buffer.from([counter])]));
    output = Buffer.concat([output, previous]);
    counter += 1;
  }
  return output.subarray(0, length);
}

function secretSeed() {
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Push notifications require the existing Supabase server secret.");
  return createHash("sha256").update("TCS-HUB-WEB-PUSH-V1\0").update(secret).digest();
}

function vapidKeyPair() {
  let privateKey = secretSeed();
  const ecdh = createECDH("prime256v1");

  for (let attempt = 0; attempt < 16; attempt += 1) {
    try {
      ecdh.setPrivateKey(privateKey);
      const publicKey = ecdh.getPublicKey(undefined, "uncompressed");
      return { privateKey: ecdh.getPrivateKey(), publicKey };
    } catch {
      privateKey = createHash("sha256").update(privateKey).digest();
    }
  }

  throw new Error("Could not derive the notification signing key.");
}

export function getVapidPublicKey() {
  return base64Url(vapidKeyPair().publicKey);
}

function vapidAuthorization(endpoint: string) {
  const { privateKey, publicKey } = vapidKeyPair();
  const encodedPublicKey = base64Url(publicKey);
  const audience = new URL(endpoint).origin;
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "tcs-operations-hub.vercel.app";
  const subject = productionHost.startsWith("http") ? productionHost : `https://${productionHost}`;

  const header = base64Url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = base64Url(Buffer.from(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + (12 * 60 * 60),
    sub: subject,
  })));
  const unsigned = `${header}.${claims}`;

  const x = base64Url(publicKey.subarray(1, 33));
  const y = base64Url(publicKey.subarray(33, 65));
  const d = base64Url(privateKey);
  const keyObject = createPrivateKey({
    key: { kty: "EC", crv: "P-256", x, y, d },
    format: "jwk",
  });

  const signature = sign("sha256", Buffer.from(unsigned), {
    key: keyObject,
    dsaEncoding: "ieee-p1363",
  });

  return {
    authorization: `vapid t=${unsigned}.${base64Url(signature)}, k=${encodedPublicKey}`,
    publicKey: encodedPublicKey,
  };
}

function encryptPayload(subscription: StoredPushSubscription, payload: string) {
  const userPublicKey = fromBase64Url(subscription.keys.p256dh);
  const authSecret = fromBase64Url(subscription.keys.auth);
  if (userPublicKey.length !== 65) throw new Error("Invalid push subscription public key.");

  const serverEcdh = createECDH("prime256v1");
  serverEcdh.generateKeys();
  const serverPublicKey = serverEcdh.getPublicKey(undefined, "uncompressed");
  const sharedSecret = serverEcdh.computeSecret(userPublicKey);

  const authPrk = hkdfExtract(authSecret, sharedSecret);
  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0", "utf8"),
    userPublicKey,
    serverPublicKey,
  ]);
  const ikm = hkdfExpand(authPrk, keyInfo, 32);

  const salt = randomBytes(16);
  const prk = hkdfExtract(salt, ikm);
  const contentKey = hkdfExpand(prk, Buffer.from("Content-Encoding: aes128gcm\0", "utf8"), 16);
  const nonce = hkdfExpand(prk, Buffer.from("Content-Encoding: nonce\0", "utf8"), 12);

  const plaintext = Buffer.concat([Buffer.from(payload, "utf8"), Buffer.from([2])]);
  const cipher = createCipheriv("aes-128-gcm", contentKey, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);

  const recordSize = 4096;
  if (ciphertext.length > recordSize) throw new Error("Push notification payload is too large.");

  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(recordSize, 16);
  header.writeUInt8(serverPublicKey.length, 20);

  return Buffer.concat([header, serverPublicKey, ciphertext]);
}

export async function sendWebPush(
  subscription: StoredPushSubscription,
  payload: {
    title: string;
    body: string;
    href: string;
    tag: string;
  },
) {
  const body = encryptPayload(subscription, JSON.stringify(payload));
  const { authorization } = vapidAuthorization(subscription.endpoint);

  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "300",
      Urgency: "high",
    },
    body: new Uint8Array(body),
  });

  return {
    ok: response.ok,
    status: response.status,
    stale: response.status === 404 || response.status === 410,
  };
}
