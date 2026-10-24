import { Capacitor, registerPlugin } from "@capacitor/core";

type NativeInfo = { version: string; bundleId: string; pushEnvironment: "sandbox" | "production"; notificationPermission: NotificationPermission };
type PushToken = { deviceToken: string; environment: "sandbox" | "production"; bundleId: string; appVersion: string };
type DevicePlugin = {
  info(): Promise<NativeInfo>;
  sessionChanged(input: { authenticated: boolean }): Promise<void>;
  scanQR(): Promise<{ value: string }>;
  takePhoto(): Promise<{ dataUrl: string }>;
  registerPush(): Promise<PushToken>;
  openSettings(): Promise<void>;
};

export const NativeDevice = registerPlugin<DevicePlugin>("TCSDevice");

export function isNativeDeviceAvailable() {
  return typeof window !== "undefined" && Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("TCSDevice");
}

export async function initializeNativeDevice() {
  if (!isNativeDeviceAvailable()) return false;
  const info = await NativeDevice.info();
  const target = window as typeof window & { __TCS_NATIVE_APP__?: object };
  target.__TCS_NATIVE_APP__ = {
    platform: "ios", ...info,
    requestPushNotifications: () => {
      void NativeDevice.registerPush()
        .then((detail) => window.dispatchEvent(new CustomEvent("tcs-native-push-token", { detail })))
        .catch((error: unknown) => window.dispatchEvent(new CustomEvent("tcs-native-push-token", {
          detail: { error: error instanceof Error ? error.message : "Could not enable notifications." },
        })));
    },
    openSettings: () => { void NativeDevice.openSettings(); },
  };
  document.documentElement.classList.add("tcs-native-ios");
  window.dispatchEvent(new Event("tcs-native-ready"));
  return true;
}

export async function takeNativePhoto() {
  const { dataUrl } = await NativeDevice.takePhoto();
  if (!dataUrl.startsWith("data:image/jpeg;base64,")) throw new Error("The camera returned an unsupported photo.");
  const response = await fetch(dataUrl);
  return new File([await response.blob()], `tcs-photo-${Date.now()}.jpg`, { type: "image/jpeg" });
}
