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
    },
  },
  plugins: [],
};
