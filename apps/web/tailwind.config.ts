import type { Config } from "tailwindcss";

// Tokens from the DaveUp design boards (PRD 13.1) and the N designs (Nov 2026).
const v = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Every app colour is a CSS variable (see globals.css), so the app can be
        // dark navy (the N designs) while the public website keeps its light sections.
        brand: { DEFAULT: v("brand"), dark: v("brand-dark"), deep: v("brand-deep"), soft: v("brand-soft"), line: v("brand-line") },
        // Errors and destructive actions stay red so they are never mistaken for normal actions.
        danger: { DEFAULT: v("danger"), dark: v("danger-dark"), soft: v("danger-soft"), line: v("danger-line") },
        ink: { DEFAULT: v("ink"), muted: v("ink-muted"), faint: v("ink-faint") },
        surface: { DEFAULT: v("surface"), card: v("card"), line: v("line") },
        /** Card and input background (white on the website, raised navy in the app). */
        card: v("card"),
        /** Text on a brand-coloured fill. */
        "on-brand": v("on-brand"),
        page: v("page"),
        ok: { DEFAULT: v("ok"), soft: v("ok-soft") },
        warn: { DEFAULT: v("warn"), soft: v("warn-soft") },
        // Public website (DaveUp.html) and app accents: deep navy with one cyan glow.
        night: { DEFAULT: "#041A4D", 2: "#06236B", 3: "#082F87", muted: "#B4C2E8" },
        glow: { DEFAULT: "#01FDFF", ink: "#0891B2" },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-inter)", "system-ui", "sans-serif"],
      },
      // One corner size everywhere: 8px (circles and pills stay rounded-full).
      borderRadius: { xl: "8px", "2xl": "8px", "3xl": "8px", card: "8px" },
    },
  },
  plugins: [],
} satisfies Config;
