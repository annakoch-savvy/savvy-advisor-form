/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        savvy: {
          gold: '#8E7E57',
          'gold-light': '#F5F0E6',
          vanilla: '#FFF8F1',
          ecru: '#C7BCA1',
          dark: '#000000',
          'deep-green': '#175242',
          'deep-green-hover': '#0f3b2e',
          'warm-gray-4': '#F5F2EC',
          'warm-gray-3': '#D3CDC4',
          'warm-gray-2': '#B2AAA1',
          'warm-gray-1': '#89837C',
        },
      },
      fontFamily: {
        sans: ['Jost', 'system-ui', 'sans-serif'],
        serif: ['"Big Caslon CC"', '"Big Caslon"', '"Libre Baskerville"', 'Georgia', 'serif'],
      },
      letterSpacing: {
        tightest: '-0.04em',
        tighter: '-0.03em',
        tight: '-0.02em',
      },
    },
  },
  plugins: [],
};
