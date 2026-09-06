import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export type TransportationConsentTokenPayload = {
  organizationId: string;
  childLegacyId: string;
  locationSlug: string;
  exp: number;
};

function signingKey() {
  const raw = process.env.TRANSPORTATION_CONSENT_SECRET?.trim() || process.env.DOCUMENT_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error("Transportation consent signing key is not configured.");
  return raw;
}

function sign(value: string) {
  return createHmac("sha256", signingKey()).update(`tcs-transport-consent-v1:${value}`).digest("base64url");
}

export function createTransportationConsentToken(payload: TransportationConsentTokenPayload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyTransportationConsentToken(token: string): TransportationConsentTokenPayload {
  const [encoded, provided] = token.split(".");
  if (!encoded || !provided) throw new Error("This consent link is invalid.");
  const expected = sign(encoded);
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length || !timingSafeEqual(expectedBuffer, providedBuffer)) {
    throw new Error("This consent link is invalid.");
  }
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as TransportationConsentTokenPayload;
  if (!payload.organizationId || !payload.childLegacyId || !payload.locationSlug || !payload.exp) throw new Error("This consent link is invalid.");
  if (Date.now() > payload.exp) throw new Error("This consent link has expired. Please request a new link from The School Shuttle.");
  return payload;
}
