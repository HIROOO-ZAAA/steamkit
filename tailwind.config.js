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
      },
      fontFamily: {
        rajdhani: ["Rajdhani", "sans-serif"],
        inter: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};
