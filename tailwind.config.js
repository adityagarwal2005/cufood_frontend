/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./*.html", "./*.js"],
  theme: {
    extend: {
      colors: {
        cream: "#faf8f6",
        "cream-alt": "#f3efe9",
        ink: "#221f1b",
        muted: "#79746b",
        line: "#e9e5df",
        accent: "#d9531e",
        "accent-deep": "#a83c15",
        "accent-soft": "#fdece2",
        error: "#b3261e",
        "error-soft": "#fbe9e7",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "accent-glow": "0 8px 24px -4px rgba(217, 83, 30, 0.35)",
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
      },
      animation: {
        "fade-in-up": "fade-in-up 0.4s ease-out forwards",
        "cart-bump": "cart-bump 0.3s ease-out",
      },
    },
  },
  plugins: [],
};
