import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0A0A0B",
        card: "#151517",
        border: "#26262A",
        moonlight: "#8FB8DE",
        tide: "#7CFFB2",
        foreground: "#F2F2F0",
        muted: "#9A9AA2",
        coral: "#FF5C5C",
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "serif"],
        sans: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-plex-mono)", "monospace"],
      },
      backgroundImage: {
        "tide-gradient": "linear-gradient(90deg, #9FFFC8 0%, #4ADE80 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
