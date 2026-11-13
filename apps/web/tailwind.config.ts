import type { Config } from "tailwindcss";

// Tokens from the DaveUp design boards (PRD 13.1).
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#D71920", dark: "#B3141A", soft: "#FDF1F1", line: "#F5C9CB" },
        ink: { DEFAULT: "#1E293B", muted: "#64748B", faint: "#94A3B8" },
        surface: { DEFAULT: "#F7F8FA", card: "#FFFFFF", line: "#E5E7EB" },
        ok: { DEFAULT: "#15803D", soft: "#ECFDF3" },
        warn: { DEFAULT: "#92400E", soft: "#FEF3C7" },
      },
      fontFamily: { sans: ["var(--font-inter)", "system-ui", "sans-serif"] },
      borderRadius: { card: "20px" },
    },
  },
  plugins: [],
} satisfies Config;
