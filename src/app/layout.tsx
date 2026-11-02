import {cookies} from "next/headers";
import {LanguageProvider,LanguageSwitch} from "@/components/i18n/LanguageProvider";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "The Hub | TCS Operations",
    template: "%s | The Hub",
  },
  applicationName: "The Hub",
  description: "Secure childcare operations app for Thomason Childcare Solutions",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/app-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/app-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/app-icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "The Hub",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#0b5d35",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const language=(await cookies()).get("tcs_language")?.value==="es"?"es":"en";
  return (
    <html
      lang={language}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans"><LanguageProvider initialLanguage={language}><div className="public-language-bar flex justify-end bg-emerald-50 p-2"><LanguageSwitch/></div>{children}</LanguageProvider></body>
    </html>
  );
}
