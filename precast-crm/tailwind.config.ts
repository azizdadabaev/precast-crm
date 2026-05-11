import type { Config } from "tailwindcss";

// All colors map to CSS variables defined in src/app/globals.css.
// The Etalon light palette tokens are HSL triplets (no `hsl()`
// wrapper) so opacity modifiers like `bg-accent/14` work — that's the
// shadcn-recommended convention and the etalon prototype's chip
// pattern depends on it (e.g. `bg-{color}/10` for status chips).

const config: Config = {
  // darkMode kept declared so re-introducing dark mode later is a
  // one-line change in globals.css. Class never appears on <html> in
  // this PR — Phase 1 of the Etalon redesign is light-only.
  darkMode: ["class"],
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-manrope)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: [
          "var(--font-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      colors: {
        border: "hsl(var(--border))",
        "border-strong": "hsl(var(--border-strong))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        "text-tertiary": "hsl(var(--text-tertiary))",
        "surface-hover": "hsl(var(--surface-hover))",
        "surface-active": "hsl(var(--surface-active))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        gold: {
          DEFAULT: "hsl(var(--gold))",
          foreground: "hsl(var(--gold-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          hover: "hsl(var(--accent-hover))",
          dim: "hsl(var(--accent-dim))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-bg))",
          border: "hsl(var(--sidebar-border))",
          text: "hsl(var(--sidebar-text))",
          hover: "hsl(var(--sidebar-hover))",
          active: "hsl(var(--sidebar-active))",
          "active-bg": "hsl(var(--sidebar-active-bg))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "var(--radius-sm)",
        sm: "var(--radius-xs)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
