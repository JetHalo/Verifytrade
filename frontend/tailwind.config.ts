import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        zkv: {
          50:  "#f5f3ff",
          100: "#ede9fe",
          400: "#a78bfa",
          500: "#8b5cf6",
          600: "#7c3aed",
          700: "#6d28d9",
          800: "#5b21b6",
          900: "#4c1d95",
        },
        neon: {
          violet: "#a78bfa",
          cyan:   "#22d3ee",
          green:  "#34d399",
          gold:   "#fbbf24",
          silver: "#cbd5e1",
          bronze: "#fb923c",
          pink:   "#f472b6",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      backgroundImage: {
        "hero-glow":
          "radial-gradient(60% 60% at 50% 0%, rgba(139, 92, 246, 0.25) 0%, rgba(34, 211, 238, 0.10) 35%, rgba(0,0,0,0) 70%)",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(139,92,246,0.30), 0 12px 60px -12px rgba(139,92,246,0.40)",
      },
      keyframes: {
        shimmer: {
          "0%":   { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        shimmer: "shimmer 2.2s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
