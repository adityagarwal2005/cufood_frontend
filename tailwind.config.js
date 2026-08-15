/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./*.html", "./*.js"],
  theme: {
    // Full override (not extend) on purpose: this is the entire type
    // scale, 8 fixed steps. Nothing outside it should be reachable via a
    // Tailwind class, so a stray text-base can't sneak back in — if a
    // size isn't listed here, `text-*` for it doesn't exist.
    // Convention: xs/sm pair with font-bold, base/lg with font-semibold or
    // font-black, xl/2xl/3xl/4xl always with font-black — see components.
    fontSize: {
      xs: ["0.75rem", { lineHeight: "1rem", letterSpacing: "0.01em" }], // 12px — labels, meta, badges
      sm: ["0.875rem", { lineHeight: "1.25rem", letterSpacing: "0" }], // 14px — secondary body, buttons
      base: ["1rem", { lineHeight: "1.5rem", letterSpacing: "0" }], // 16px — primary body
      lg: ["1.25rem", { lineHeight: "1.625rem", letterSpacing: "-0.01em" }], // 20px — card/list titles
      xl: ["1.5rem", { lineHeight: "1.875rem", letterSpacing: "-0.02em" }], // 24px — section headings
      "2xl": ["2rem", { lineHeight: "2.25rem", letterSpacing: "-0.03em" }], // 32px — page subheads
      "3xl": ["3rem", { lineHeight: "1.02", letterSpacing: "-0.04em" }], // 48px — H1 (mobile)
      "4xl": ["4rem", { lineHeight: "0.95", letterSpacing: "-0.045em" }], // 64px — H1 (desktop)
    },
    extend: {
      colors: {
        // Premium dark system (Uber-careers-site inspired): near-black
        // canvas throughout, warm off-white text, one saturated accent.
        // cream/cream-alt keep their old names (page canvas / elevated
        // surface) but are now the dark end of the ramp — every place that
        // read "bg-cream = light page background" still does, it's just
        // that "light" now means near-black. Same for ink: still "the
        // primary text/ink color," just flipped to a warm off-white so it
        // reads on the new dark surfaces.
        cream: "#060605",
        "cream-alt": "#141311",
        ink: "#f4f1ea",
        muted: "#9c988f",
        line: "#26241f",
        accent: "#d9531e",
        "accent-deep": "#ff8a5c",
        "accent-soft": "#2b160c",
        error: "#ff6152",
        "error-soft": "#3a1512",
        success: "#3ecf8e",
        "success-soft": "#0f2e1f",
        skeleton: "#171612",
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
