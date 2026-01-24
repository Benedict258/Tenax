/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        grotesk: ['"Space Grotesk"', '"Segoe UI"', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#f5f7ff',
          100: '#e8ecff',
          500: '#7b61ff',
          600: '#5f47d8',
        },
      },
      backgroundImage: {
        'noise': "url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27100%27 height=%27100%27 viewBox=%270 0 100 100%27%3E%3Ccircle fill=%27rgba(255,255,255,0.02)%27 cx=%2750%27 cy=%2750%27 r=%271%27/%3E%3C/svg%3E')",
      },
      boxShadow: {
        glow: '0 20px 80px rgba(123,97,255,0.25)',
      },
    },
  },
  plugins: [],
};
