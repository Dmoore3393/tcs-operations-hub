"use client";

import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { locationFromSlug } from "@/lib/location-config";
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
import { useCallback, useEffect, useRef, useState } from "react";

type ScannerState = "checking" | "starting" | "scanning" | "blocked" | "unsupported" | "found";

function checkInTargetFromQr(rawValue: string) {
  try {
    const parsed = new URL(rawValue, window.location.origin);
    const allowedHosts = new Set([
      window.location.host,
      "tcs-operations-hub.vercel.app",
    ]);

    if (!allowedHosts.has(parsed.host)) return null;
    if (parsed.pathname.replace(/\/$/, "") !== "/parent/check-in") return null;

    const slug = parsed.searchParams.get("location")?.trim().toLowerCase() || "";
    if (!slug || !locationFromSlug(slug)) return null;

    return `/parent/check-in?location=${encodeURIComponent(slug)}`;
  } catch {
    return null;
  }
}

export default function ParentQrScannerPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const navigatingRef = useRef(false);
  const invalidNoticeAtRef = useRef(0);

  const [state, setState] = useState<ScannerState>("checking");
  const [error, setError] = useState("");
  const [accessReady, setAccessReady] = useState(false);

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

  const startCamera = useCallback(async () => {
    if (!accessReady || navigatingRef.current) return;

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
      if (!context) throw new Error("The scanner could not start on this device.");

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
              const target = checkInTargetFromQr(code.data);

              if (target) {
                navigatingRef.current = true;
                setState("found");
                setError("");
                if ("vibrate" in navigator) navigator.vibrate?.(90);
                stopCamera();
                router.replace(target);
                return;
              }

              const now = Date.now();
              if (now - invalidNoticeAtRef.current > 1800) {
                invalidNoticeAtRef.current = now;
                setError("That is not a TCS location check-in QR. Keep the TCS code inside the square.");
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
  }, [accessReady, router, stopCamera]);

  useEffect(() => {
    if (!supabase || !isSupabaseConfigured) {
      setState("unsupported");
      setError("The secure Parent Portal connection is not configured.");
      return;
    }

    const client = supabase;
    let active = true;

    void client.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      const session = data.session;

      if (!session) {
        router.replace(`/parent-login?returnTo=${encodeURIComponent("/parent/scan")}`);
        return;
      }

      try {
        const response = await fetch("/api/parent/account-status", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({})) as {
          hasActiveAccess?: boolean;
          error?: string;
        };

        if (!response.ok || !payload.hasActiveAccess) {
          throw new Error(payload.error || "Your Parent Portal account does not have active child access.");
        }

        if (!active) return;
        setAccessReady(true);
        setState("starting");
      } catch (caught) {
        if (!active) return;
        setState("blocked");
        setError(caught instanceof Error ? caught.message : "Parent Portal access could not be verified.");
      }
    });

    return () => {
      active = false;
      stopCamera();
    };
  }, [router, stopCamera]);

  useEffect(() => {
    if (!accessReady) return;
    const timer = window.setTimeout(() => {
      void startCamera();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [accessReady, startCamera]);

  return (
    <main className="min-h-[100dvh] bg-[#071d14] text-white">
      <header className="px-4 pb-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
          <button
            onClick={() => {
              stopCamera();
              router.push("/parent");
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-black"
          >
            <ArrowLeft className="h-4 w-4" /> Parent Portal
          </button>
          <div className="flex items-center gap-2 text-right">
            <ShieldCheck className="h-4 w-4 text-emerald-300" />
            <div>
              <p className="text-[9px] font-black uppercase tracking-[.18em] text-emerald-300">TCS Family Attendance</p>
              <p className="text-xs font-black">Secure QR Scan</p>
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-xl px-4 pb-10">
        <div className="mb-5 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-400/15 text-emerald-300">
            <QrCode className="h-8 w-8" />
          </div>
          <h1 className="mt-4 text-3xl font-black">Scan the location QR</h1>
          <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-emerald-50/70">
            Point your camera at the TCS QR posted at the location. The Hub will open check-in/out for that site automatically.
          </p>
        </div>

        <div className="relative overflow-hidden rounded-[32px] border border-white/15 bg-black shadow-2xl">
          <div className="relative aspect-[3/4] w-full sm:aspect-[4/3]">
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full object-cover"
              aria-label="Camera view for scanning a TCS location QR code"
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

            {(state === "checking" || state === "starting") && (
              <div className="absolute inset-0 grid place-items-center bg-black/65 p-6 text-center">
                <div>
                  <LoaderCircle className="mx-auto h-9 w-9 animate-spin text-emerald-300" />
                  <p className="mt-3 text-sm font-black">{state === "checking" ? "Checking Parent Portal access…" : "Opening camera…"}</p>
                </div>
              </div>
            )}

            {state === "found" && (
              <div className="absolute inset-0 grid place-items-center bg-emerald-950/90 p-6 text-center">
                <div>
                  <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-300" />
                  <p className="mt-3 text-lg font-black">Location found</p>
                  <p className="mt-1 text-xs font-semibold text-emerald-100/75">Opening your family check-in…</p>
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
            <p className="mt-1 text-xs font-semibold leading-5 text-emerald-50/65">Hold the QR steady inside the square. You do not need to take a picture.</p>
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
              <p className="text-xs font-black">Camera privacy</p>
              <p className="mt-1 text-[11px] font-semibold leading-5 text-emerald-50/65">
                The camera image is processed on your device to find the QR code. The Hub does not upload or save camera video or photos from this scanner.
              </p>
            </div>
          </div>
        </div>

        <p className="mt-5 px-3 text-center text-[11px] font-semibold leading-5 text-slate-400">
          Backup option: the same posted QR can still be scanned with your phone’s regular Camera app. It will open the same secure TCS family check-in page.
        </p>

        <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
      </section>
    </main>
  );
}
