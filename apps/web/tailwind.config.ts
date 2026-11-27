import type { Config } from "tailwindcss";

// Tokens from the DaveUp design boards (PRD 13.1).
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Dark navy on white.
        brand: { DEFAULT: "#1E3A8A", dark: "#172C69", deep: "#0F1F4D", soft: "#EEF2FA", line: "#C9D4EE" },
        // Errors and destructive actions stay red so they are never mistaken for normal actions.
        danger: { DEFAULT: "#B42318", dark: "#912018", soft: "#FEF3F2", line: "#FECDCA" },
        ink: { DEFAULT: "#1E293B", muted: "#64748B", faint: "#94A3B8" },
        surface: { DEFAULT: "#F7F8FA", card: "#FFFFFF", line: "#E5E7EB" },
        ok: { DEFAULT: "#15803D", soft: "#ECFDF3" },
        warn: { DEFAULT: "#92400E", soft: "#FEF3C7" },
        // Public website (DaveUp.html): deep navy bands with one cyan glow.
        night: { DEFAULT: "#041A4D", 2: "#06236B", 3: "#082F87", muted: "#B4C2E8" },
        glow: { DEFAULT: "#01FDFF", ink: "#0891B2" },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: { card: "20px" },
    },
  },
  plugins: [],
} satisfies Config;
