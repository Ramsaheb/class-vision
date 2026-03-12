/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          light: '#276EF1',
          dark: '#4F80FF',
        },
        background: {
          light: '#F9FAFB',
          dark: '#1E1E2F',
        },
        card: {
          light: '#FFFFFF',
          dark: '#2A2D3E',
        },
      },
      transitionProperty: {
        'theme': 'background-color, border-color, color, fill, stroke',
      },
    },
  },
  plugins: [],
};
