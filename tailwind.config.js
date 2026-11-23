/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        nexusPrimary: "#10B981",
        nexusSecondary: "#0E5844",
        nexusTertiary: "#94A3B8",
        nexusNeutral: "#0F172A",
        nexusSurface: "#111C32",
        nexusSurfaceRaised: "#13203A",
        nexusText: "#F8FAFC",
        nexusBorder: "#1E3350",
        nexusGrid: "#16304A",
        // Aurora Night tokens. These reference the variables set by
        // dashboard-theme.css so utilities follow the active dashboard theme.
        "dash-canvas": "var(--dash-canvas)",
        "dash-surface": "var(--dash-surface)",
        "dash-raised": "var(--dash-surface-raised)",
        "dash-hover": "var(--dash-surface-hover)",
        "dash-border": "var(--dash-border)",
        "dash-border-strong": "var(--dash-border-strong)",
        "dash-text": "var(--dash-text)",
        "dash-text-secondary": "var(--dash-text-secondary)",
        "dash-text-muted": "var(--dash-text-muted)",
        "dash-accent": "var(--dash-accent)",
        "dash-primary": "var(--dash-primary)",
        "dash-action": "var(--dash-action)",
        "dash-action-hover": "var(--dash-action-hover)",
        "dash-danger": "var(--dash-danger)",
        "dash-warning": "var(--dash-warning)",
        "dash-success": "var(--dash-success)",
      },
      fontFamily: {
        rajdhani: ["Rajdhani", "sans-serif"],
        inter: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};
