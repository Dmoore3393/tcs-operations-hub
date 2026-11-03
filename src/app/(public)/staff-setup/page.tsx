import type { Metadata } from "next";
import StaffSetup from "@/components/StaffSetup";

export const metadata: Metadata = {
  title: "Staff Account Setup",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function StaffSetupPage() {
  return <StaffSetup />;
}
