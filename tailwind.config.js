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
        }
      }
    },
  },
  plugins: [],
}