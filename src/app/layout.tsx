import type { Metadata, Viewport } from "next";
import { Anybody, Dela_Gothic_One, Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });
const anybody = Anybody({ variable: "--font-anybody", subsets: ["latin"], axes: ["wdth"], display: "swap" });
const instrument = Instrument_Serif({ variable: "--font-instrument", subsets: ["latin"], weight: "400", style: ["italic", "normal"], display: "swap" });
const dela = Dela_Gothic_One({ variable: "--font-dela", subsets: ["latin"], weight: "400", display: "swap" });

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3200";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: "Rakaza", template: "%s · Rakaza" },
  description: "Rakaza: an AI character on Solana that talks, keeps a daily diary and risk-checks pump.fun coins.",
  applicationName: "Rakaza",
  robots: { index: false, follow: false }, // flipped on in Phase 2 when public pages are real
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#120828" },
    { media: "(prefers-color-scheme: light)", color: "#f8f5ff" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="dark"
      data-skin="classic"
      className={`${geist.variable} ${geistMono.variable} ${anybody.variable} ${instrument.variable} ${dela.variable} dark h-full`}
      suppressHydrationWarning
    >
      <head>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/theme.js" />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
