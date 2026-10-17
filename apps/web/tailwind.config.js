/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html','./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter','ui-sans-serif','system-ui','sans-serif'] },
      boxShadow: { soft: '0 2px 8px rgba(15,23,42,.025)' }
    }
  },
  plugins: []
};
