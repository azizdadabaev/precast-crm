import "./globals.css";
import type { Metadata } from "next";
import {
  Manrope,
  JetBrains_Mono,
  Playfair_Display,
  IBM_Plex_Mono,
  Golos_Text,
} from "next/font/google";
import { Providers } from "@/components/providers";

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-manrope",
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
  weight: ["400", "500", "600", "700"],
});

const playfairDisplay = Playfair_Display({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-display",
  weight: ["500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-num",
  weight: ["400", "500", "700"],
});

const golosText = Golos_Text({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-body-alt",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Precast CRM",
  description: "Beam-and-block precast concrete CRM, calculation & sales system",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${manrope.variable} ${jetbrainsMono.variable} ${playfairDisplay.variable} ${ibmPlexMono.variable} ${golosText.variable}`}
    >
      <body className="min-h-screen bg-background text-foreground antialiased font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
