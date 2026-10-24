import { AuthProvider } from "@/components/providers/AuthProvider";
import { LocationProvider } from "@/components/providers/LocationProvider";
import PwaUpdater from "@/components/pwa/PwaUpdater";
import DemoWorkspaceNotice from "@/components/DemoWorkspaceNotice";
import type { Metadata } from "next";
import NativeCapabilities from "@/components/native/NativeCapabilities";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <><PwaUpdater /><AuthProvider><LocationProvider><NativeCapabilities /><DemoWorkspaceNotice />{children}</LocationProvider></AuthProvider></>;
}
