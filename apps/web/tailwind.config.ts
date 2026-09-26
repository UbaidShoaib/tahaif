import type { Config } from "tailwindcss";

/** A color backed by a bare-HSL CSS variable in styles/globals.css, with opacity support. */
const token = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      screens: {
        xs: "375px",
      },
      colors: {
        // Anaar (pomegranate berry) — ADR 0003.
        // `primary` / `primary-hover` / `primary-foreground` follow the theme (berry in
        // light, pink with a dark label in dark mode) and are for the main CTA only.
        // The numbered scale is fixed; use 700+ for text and filled backgrounds.
        primary: {
          DEFAULT: token("primary"),
          hover: token("primary-hover"),
          foreground: token("primary-foreground"),
          soft: token("primary-soft"),
          "soft-foreground": token("primary-soft-foreground"),
          50: "#fdf2f6",
          100: "#fce7ef",
          200: "#f9cfe0",
          300: "#f4a6c4",
          400: "#ec74a0",
          500: "#db4a7d",
          600: "#c02d63",
          700: "#9f1f50",
          800: "#831a44",
          900: "#6b173a",
          950: "#420a21",
        },
        // Zari (antique gold) — decorative only, never text on light backgrounds or buttons.
        gold: {
          DEFAULT: token("gold"),
          foreground: token("gold-foreground"),
          soft: token("gold-soft"),
          ink: token("gold-ink"),
          dark: "#a16207",
        },
        link: token("link"),
        star: token("star"),
        background: { DEFAULT: token("background"), alt: token("background-alt") },
        foreground: { DEFAULT: token("foreground"), secondary: token("foreground-secondary") },
        border: token("border"),
        input: token("input"),
        ring: token("ring"),
        secondary: { DEFAULT: token("secondary"), foreground: token("secondary-foreground") },
        muted: { DEFAULT: token("muted"), foreground: token("muted-foreground") },
        accent: { DEFAULT: token("accent"), foreground: token("accent-foreground") },
        card: { DEFAULT: token("card"), foreground: token("card-foreground") },
        popover: { DEFAULT: token("popover"), foreground: token("popover-foreground") },
        success: {
          DEFAULT: token("success"),
          soft: token("success-soft"),
          foreground: token("success-foreground"),
        },
        warning: { DEFAULT: token("warning"), soft: token("warning-soft") },
        destructive: {
          DEFAULT: token("destructive"),
          soft: token("destructive-soft"),
          foreground: token("destructive-foreground"),
        },
        info: { DEFAULT: token("info"), soft: token("info-soft") },
      },
      fontFamily: {
        // Naskh after the Latin faces: browsers fall back per glyph, so Urdu text
        // (including the تحائف wordmark) gets Naskh while English keeps Inter/Fraunces.
        sans: ["var(--font-inter)", "var(--font-naskh)", "system-ui", "sans-serif"],
        display: ["var(--font-fraunces)", "var(--font-naskh)", "Georgia", "serif"],
      },
      fontSize: {
        // Fluid headings: mobile → desktop sizes from the redesign plan §3.3.
        display: ["clamp(2.25rem, 1.5rem + 3vw, 3.5rem)", { lineHeight: "1.1", fontWeight: "600" }],
        h1: ["clamp(1.75rem, 1.4rem + 1.2vw, 2.25rem)", { lineHeight: "1.2", fontWeight: "600" }],
        h2: ["clamp(1.375rem, 1.1rem + 1vw, 1.75rem)", { lineHeight: "1.25", fontWeight: "500" }],
        h3: ["clamp(1.125rem, 1rem + 0.4vw, 1.25rem)", { lineHeight: "1.35", fontWeight: "600" }],
      },
      spacing: {
        "4.5": "1.125rem",
        "18": "4.5rem",
      },
      minHeight: { tap: "2.75rem" },
      minWidth: { tap: "2.75rem" },
      borderRadius: {
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius)",
        md: "var(--radius)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow-md)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
      },
      transitionTimingFunction: {
        out: "var(--ease-out)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
