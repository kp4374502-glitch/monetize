import type { Config } from "tailwindcss";

// Single source of truth for the brand tokens in docs/PRODUCT_SPEC.md -> "Design system".
const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: { primary: "#000000", secondary: "#000000" },
        text: { primary: "#ffffff", secondary: "#a3a3a3" },
        // "gold" tokens now carry the single amber accent (#FFB433); names kept so every usage follows.
        gold: { light: "#ffb433", dark: "#c98a1c", border: "#ffb433" },
        subtle: "#2a2a2a",
      },
      backgroundImage: {
        // Flat amber on purpose (same stop twice): solid accent, no gradient fills.
        "gold-gradient": "linear-gradient(135deg, #ffb433, #ffb433)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        // No serif in the UI any more: the old serif slot resolves to the same sans (Manrope).
        serif: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
