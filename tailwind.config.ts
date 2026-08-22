import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0B1220",
        card: "#1E2A4A",
        border: "#2A3A5C",
        moonlight: "#8FB8DE",
        tide: "#2DD4BF",
        foreground: "#F5EFE0",
        muted: "#9AAAC7",
        coral: "#FF6B6B",
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "serif"],
        sans: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-plex-mono)", "monospace"],
      },
      backgroundImage: {
        "tide-gradient": "linear-gradient(90deg, #8FB8DE 0%, #2DD4BF 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
