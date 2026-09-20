import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Spectral } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Display face for the wordmark and page titles.
 *
 * Until now nothing set --font-sans correctly, so the whole app fell back to the browser's
 * default serif (Times New Roman). That accident actually flattered the hero, so rather than
 * lose the look entirely this makes it deliberate: a screen-optimised serif for display type,
 * with Geist doing the UI work. Spectral holds up far better than Times on a dark background,
 * where high-contrast serifs go thin and fragile.
 *
 * Swap the family here if you want something more ornate (Cinzel is the obvious fantasy
 * alternative, though its lowercase reads as small caps).
 */
const spectral = Spectral({
  variable: "--font-spectral",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Undercroft — MTG Commander",
  description: "Play Magic: The Gathering Commander against AI opponents in your browser.",
  applicationName: "Undercroft",
  // Without these, sharing the link in a group chat or Discord renders as a bare URL.
  openGraph: {
    type: "website",
    siteName: "Undercroft",
    title: "Undercroft — Commander, Reimagined",
    description:
      "Play Magic: The Gathering Commander against AI opponents — right in your browser. Full rules engine, real cards, no downloads.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Undercroft — Commander, Reimagined",
    description:
      "Play Magic: The Gathering Commander against AI opponents — right in your browser.",
  },
};

export const viewport: Viewport = {
  themeColor: "#15110d",
  width: "device-width",
  initialScale: 1,
  // The game view is full-bleed and uses 100dvh; cover lets it reach into the safe areas
  // instead of leaving letterbox bars on notched phones.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${geistSans.variable} ${geistMono.variable} ${spectral.variable}`}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${spectral.variable} antialiased min-h-screen`}
        suppressHydrationWarning
      >
        <Providers>
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </Providers>
      </body>
    </html>
  );
}
