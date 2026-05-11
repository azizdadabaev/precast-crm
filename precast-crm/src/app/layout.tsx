import "./globals.css";
import type { Metadata } from "next";
import { Manrope, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/providers";

// Manrope = the UI / body / heading face (per the Etalon design handoff
// at docs/design/etalon-ui.jsx → getTokens(false).body / .head).
// JetBrains Mono = column-aligned numerics in tables, KPI numbers,
// status chips. Both are exposed as CSS variables so globals.css can
// reference them via `var(--font-manrope)` / `var(--font-mono)`.
const manrope = Manrope({
  subsets: ["latin", "cyrillic"], // Cyrillic for the bilingual UZ/EN labels
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

export const metadata: Metadata = {
  title: "Precast CRM",
  description: "Beam-and-block precast concrete CRM, calculation & sales system",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${manrope.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-background text-foreground antialiased font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
