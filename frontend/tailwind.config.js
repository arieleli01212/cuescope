/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Rubik", "system-ui", "-apple-system", "Segoe UI", "Arial", "sans-serif"],
      },
      colors: {
        bg: "#070b14",
        surface: "#0c1322",
        "surface-raised": "#111b2e",
        text: "#f7fbff",
        muted: "#95a3b8",
        border: "rgba(148, 163, 184, 0.16)",
        primary: "#2dd4a7",
        "primary-dark": "#23b991",
        "primary-foreground": "#071019",
        cyan: "#38bdf8",
        "expense-ink": "#60a5fa",
        "expense-foreground": "#071019",
        critical: "#fb7185",
        "critical-foreground": "#071019",
      },
      boxShadow: {
        premium: "0 24px 70px rgba(0, 0, 0, 0.34)",
        glow: "0 0 0 1px rgba(45, 212, 167, 0.18), 0 12px 32px rgba(45, 212, 167, 0.2)",
      },
      borderRadius: {
        DEFAULT: "14px",
      },
      transitionDuration: {
        premium: "180ms",
      },
    },
  },
  plugins: [],
};
