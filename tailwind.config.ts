import type { Config } from "tailwindcss";

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
    },
  },
  plugins: [],
};

export default config;
