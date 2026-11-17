/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}"
  ],
  darkMode: 'class',
  // REQUIRED FOR NATIVEWIND v4:
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        brand: {
          light: '#4CAF50', 
          DEFAULT: '#2E7D32', // Cricket Green 
          dark: '#1B5E20', 
        },
        action: {
          light: '#42A5F5',
          DEFAULT: '#1976D2', // KYCO Blue
          dark: '#1565C0',
        },
        accent: {
          DEFAULT: '#FFC107', 
        },
        surface: {
          DEFAULT: '#FFFFFF',
          background: '#F8FAFC', 
        },
        text: {
          primary: '#1E293B', 
          secondary: '#64748B', 
        },
        // Elegant redesign tokens (Shastri-approved direction,
        // 2026-11-17): navy kit anchor, gold kept precious (stars,
        // XP, the one main action), pitch green for go/correct,
        // warm off-white canvas, hairline warm borders.
        navy: {
          DEFAULT: '#0A192F',
          deep: '#060F1F',
          soft: '#16263F',
        },
        gold: {
          light: '#F3E5BE',
          DEFAULT: '#D4AF37',
          dark: '#B8912A',
        },
        pitch: {
          light: '#E3EFE3',
          DEFAULT: '#2E7D32',
          dark: '#1B5E20',
        },
        canvas: '#FAF8F4',
        inkline: '#E9E2D4',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Manrope', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}