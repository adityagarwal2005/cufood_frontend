/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./*.html", "./*.js"],
  theme: {
    extend: {
      colors: {
        cream: "#ffffff",
        "cream-alt": "#f4f4f4",
        ink: "#0a0a0a",
        muted: "#6b6b6b",
        line: "#e6e6e6",
        accent: "#d9531e",
        "accent-deep": "#a83c15",
        "accent-soft": "#fbe4d8",
        error: "#b3261e",
        "error-soft": "#fbe9e7",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      letterSpacing: {
        tightest: "-0.045em",
      },
      boxShadow: {
        "accent-glow": "0 12px 30px -10px rgba(10, 10, 10, 0.35)",
        premium: "0 24px 60px -20px rgba(10, 10, 10, 0.25)",
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(0.5rem)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "cart-bump": {
          "0%": { transform: "scale(1)" },
          "35%": { transform: "scale(1.15)" },
          "100%": { transform: "scale(1)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 0.22s cubic-bezier(0.16,1,0.3,1) forwards",
        "cart-bump": "cart-bump 0.18s ease-out",
        "scale-in": "scale-in 0.18s cubic-bezier(0.16,1,0.3,1) forwards",
      },
      transitionDuration: {
        DEFAULT: "120ms",
      },
    },
  },
  plugins: [],
};
