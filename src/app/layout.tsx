import type { Metadata } from "next";
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
