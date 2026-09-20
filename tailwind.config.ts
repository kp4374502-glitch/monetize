import type { Config } from "tailwindcss";

// Single source of truth for the brand tokens in docs/PRODUCT_SPEC.md -> "Design system".
const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: { primary: "#0a0a0a", secondary: "#000000" },
        text: { primary: "#ffffff", secondary: "#a3a3a3" },
        gold: { light: "#f0c572", dark: "#9c7a2e", border: "#c9a227" },
        subtle: "#2a2a2a",
      },
      backgroundImage: {
        // --accent-gradient: linear-gradient(135deg, #F0C572, #9C7A2E)
        "gold-gradient": "linear-gradient(135deg, #f0c572, #9c7a2e)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        // italic serif accent: marketing/auth headlines only, never dense data screens
        serif: ["var(--font-serif)", "ui-serif", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
