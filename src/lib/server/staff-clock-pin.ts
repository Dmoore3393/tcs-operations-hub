import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { User } from "@supabase/supabase-js";

function clockPinSecret() {
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Missing server secret for staff clock PIN protection.");
  return createHmac("sha256", secret).update("tcs-hub-staff-clock-pin-v1").digest();
}

export function staffClockPinDigest(userId: string, pin: string) {
  return createHmac("sha256", clockPinSecret())
    .update(`${userId}:${pin}`)
    .digest("base64url");
}

export function staffClockPinConfigured(user: User) {
  return typeof user.app_metadata?.tcs_clock_pin_hmac === "string"
    && user.app_metadata.tcs_clock_pin_hmac.length > 20;
}

export function verifyStaffClockPin(user: User, pin: string) {
  if (!/^\d{4,6}$/.test(pin)) return false;

  const expectedText = typeof user.app_metadata?.tcs_clock_pin_hmac === "string"
    ? user.app_metadata.tcs_clock_pin_hmac
    : "";
  if (!expectedText) return false;

  const actualText = staffClockPinDigest(user.id, pin);
  const expected = Buffer.from(expectedText);
  const actual = Buffer.from(actualText);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
