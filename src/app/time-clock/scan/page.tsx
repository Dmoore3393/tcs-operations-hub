"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { locationFromSlug, normalizeLocation } from "@/lib/location-config";
import jsQR from "jsqr";
import {
  ArrowLeft,
  Camera,
  CameraOff,
  CheckCircle2,
  LoaderCircle,
  QrCode,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ScannerState = "starting" | "scanning" | "blocked" | "unsupported" | "found";
type ClockAction = "clock_in" | "clock_out";

function actionFromUrl(): ClockAction {
  if (typeof window === "undefined") return "clock_in";
  return new URLSearchParams(window.location.search).get("action") === "clock_out" ? "clock_out" : "clock_in";
}

function locationSlugFromQr(rawValue: string) {
  try {
    const parsed = new URL(rawValue, window.location.origin);
    const allowedHosts = new Set([
      window.location.host,
      "tcs-operations-hub.vercel.app",
    ]);

    if (!allowedHosts.has(parsed.host)) return null;

    const pathname = parsed.pathname.replace(/\/$/, "");
    if (pathname !== "/parent/check-in") return null;

    const slug = parsed.searchParams.get("location")?.trim().toLowerCase() || "";
    return slug && locationFromSlug(slug) ? slug : null;
  } catch {
    return null;
  }
}

export default function StaffQrTimeClockScannerPage() {
  const router = useRouter();
  const { profile, isSystemOwner } = useAuth();
  const action = useMemo(actionFromUrl, []);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const navigatingRef = useRef(false);
  const invalidNoticeAtRef = useRef(0);

  const [state, setState] = useState<ScannerState>("starting");
  const [error, setError] = useState("");

  const stopCamera = useCallback(() => {
    runningRef.current = false;

    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
  }, []);

  const locationAllowed = useCallback((slug: string) => {
    const location = locationFromSlug(slug);
    if (!location) return false;
    if (isSystemOwner) return true;
    if (!profile) return false;

    const assigned = profile.locations ?? [];
    if (assigned.includes("All Locations")) return true;
    return assigned.some((item) => normalizeLocation(item) === location);
  }, [isSystemOwner, profile]);

  const startCamera = useCallback(async () => {
    if (!profile || navigatingRef.current) return;

    stopCamera();
    setError("");
    setState("starting");

    if (!navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      setError("This device cannot open the camera inside The Hub.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      video.muted = true;
      await video.play();

      runningRef.current = true;
      setState("scanning");

      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("The staff QR scanner could not start on this device.");

      let lastScanAt = 0;

      const scanFrame = (time: number) => {
        if (!runningRef.current || navigatingRef.current) return;

        if (time - lastScanAt >= 180 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          lastScanAt = time;

          const sourceWidth = video.videoWidth;
          const sourceHeight = video.videoHeight;

          if (sourceWidth > 0 && sourceHeight > 0) {
            const targetWidth = Math.min(720, sourceWidth);
            const targetHeight = Math.max(1, Math.round(sourceHeight * (targetWidth / sourceWidth)));

            if (canvas.width !== targetWidth) canvas.width = targetWidth;
            if (canvas.height !== targetHeight) canvas.height = targetHeight;

            context.drawImage(video, 0, 0, targetWidth, targetHeight);
            const imageData = context.getImageData(0, 0, targetWidth, targetHeight);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: "dontInvert",
            });

            if (code?.data) {
              const slug = locationSlugFromQr(code.data);

              if (slug && locationAllowed(slug)) {
                navigatingRef.current = true;
                setState("found");
                setError("");
                if ("vibrate" in navigator) navigator.vibrate?.(90);
                stopCamera();

                const next = new URLSearchParams({
                  qr: "1",
                  qrLocation: slug,
                  qrAction: action,
                });
                router.replace(`/time-clock?${next.toString()}`);
                return;
              }

              const now = Date.now();
              if (now - invalidNoticeAtRef.current > 1800) {
                invalidNoticeAtRef.current = now;
                setError(
                  slug
                    ? "That location is not assigned to your staff account."
                    : "That is not a valid TCS location QR. Keep the posted TCS code inside the square.",
                );
              }
            }
          }
        }

        frameRef.current = window.requestAnimationFrame(scanFrame);
      };

      frameRef.current = window.requestAnimationFrame(scanFrame);
    } catch (caught) {
      stopCamera();
      const name = caught instanceof DOMException ? caught.name : "";

      if (name === "NotAllowedError" || name === "SecurityError") {
        setState("blocked");
        setError("Camera access is turned off for The Hub. Allow camera access, then tap Try Camera Again.");
      } else {
        setState("blocked");
        setError(caught instanceof Error ? caught.message : "The Hub could not open the camera.");
      }
    }
  }, [action, locationAllowed, profile, router, stopCamera]);

  useEffect(() => {
    if (!profile) return;
    const timer = window.setTimeout(() => {
      void startCamera();
    }, 120);

    return () => {
      window.clearTimeout(timer);
      stopCamera();
    };
  }, [profile, startCamera, stopCamera]);

  const actionLabel = action === "clock_out" ? "Clock Out" : "Clock In";

  return (
    <main className="min-h-[100dvh] bg-[#071d14] text-white">
      <header className="px-4 pb-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
          <button
            onClick={() => {
              stopCamera();
              router.push("/time-clock");
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-black"
          >
            <ArrowLeft className="h-4 w-4" /> Time Clock
          </button>

          <div className="flex items-center gap-2 text-right">
            <ShieldCheck className="h-4 w-4 text-emerald-300" />
            <div>
              <p className="text-[9px] font-black uppercase tracking-[.18em] text-emerald-300">TCS Staff Time Clock</p>
              <p className="text-xs font-black">Location QR</p>
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-xl px-4 pb-10">
        <div className="mb-5 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-400/15 text-emerald-300">
            <QrCode className="h-8 w-8" />
          </div>
          <h1 className="mt-4 text-3xl font-black">Scan to {actionLabel}</h1>
          <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-emerald-50/70">
            Scan the same TCS location QR families use. The Hub will select that work site and return you to the Time Clock to confirm {actionLabel.toLowerCase()}.
          </p>
        </div>

        <div className="relative overflow-hidden rounded-[32px] border border-white/15 bg-black shadow-2xl">
          <div className="relative aspect-[3/4] w-full sm:aspect-[4/3]">
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full object-cover"
              aria-label="Camera view for scanning a TCS location QR code for staff time clock"
            />

            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,.2),transparent_22%,transparent_78%,rgba(0,0,0,.28))]" />
            <div className="pointer-events-none absolute inset-0 grid place-items-center p-10">
              <div className="relative aspect-square w-full max-w-64 rounded-[28px] border-2 border-white/90 shadow-[0_0_0_999px_rgba(0,0,0,.18)]">
                <span className="absolute -left-1 -top-1 h-10 w-10 rounded-tl-[26px] border-l-4 border-t-4 border-emerald-300" />
                <span className="absolute -right-1 -top-1 h-10 w-10 rounded-tr-[26px] border-r-4 border-t-4 border-emerald-300" />
                <span className="absolute -bottom-1 -left-1 h-10 w-10 rounded-bl-[26px] border-b-4 border-l-4 border-emerald-300" />
                <span className="absolute -bottom-1 -right-1 h-10 w-10 rounded-br-[26px] border-b-4 border-r-4 border-emerald-300" />
                {state === "scanning" && <div className="absolute left-4 right-4 top-1/2 h-0.5 animate-pulse bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,.9)]" />}
              </div>
            </div>

            {state === "starting" && (
              <div className="absolute inset-0 grid place-items-center bg-black/65 p-6 text-center">
                <div>
                  <LoaderCircle className="mx-auto h-9 w-9 animate-spin text-emerald-300" />
                  <p className="mt-3 text-sm font-black">Opening camera…</p>
                </div>
              </div>
            )}

            {state === "found" && (
              <div className="absolute inset-0 grid place-items-center bg-emerald-950/90 p-6 text-center">
                <div>
                  <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-300" />
                  <p className="mt-3 text-lg font-black">Location found</p>
                  <p className="mt-1 text-xs font-semibold text-emerald-100/75">Returning to the Time Clock…</p>
                </div>
              </div>
            )}

            {(state === "blocked" || state === "unsupported") && (
              <div className="absolute inset-0 grid place-items-center bg-slate-950 p-6 text-center">
                <div className="max-w-sm">
                  <CameraOff className="mx-auto h-11 w-11 text-amber-300" />
                  <p className="mt-3 text-lg font-black">Camera needs attention</p>
                  <p className="mt-2 text-xs font-semibold leading-5 text-slate-300">{error || "The camera could not be started."}</p>
                  {state !== "unsupported" && (
                    <button
                      onClick={() => void startCamera()}
                      className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-emerald-950"
                    >
                      <RefreshCw className="h-4 w-4" /> Try Camera Again
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {state === "scanning" && (
          <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-center">
            <p className="inline-flex items-center gap-2 text-sm font-black text-emerald-100">
              <Camera className="h-4 w-4 text-emerald-300" /> Camera is ready
            </p>
            <p className="mt-1 text-xs font-semibold leading-5 text-emerald-50/65">Hold the posted location QR steady inside the square. The scan selects the work location; you will confirm before a clock event is recorded.</p>
          </div>
        )}

        {error && state === "scanning" && (
          <div className="mt-3 rounded-2xl border border-amber-300/25 bg-amber-300/10 p-3 text-center text-xs font-bold leading-5 text-amber-100">
            {error}
          </div>
        )}

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 flex-none text-emerald-300" />
            <div>
              <p className="text-xs font-black">What the QR verifies</p>
              <p className="mt-1 text-[11px] font-semibold leading-5 text-emerald-50/65">
                The Hub records that the clock action used the QR assigned to that TCS location. It does not use or claim GPS verification.
              </p>
            </div>
          </div>
        </div>

        <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
      </section>
    </main>
  );
}
