/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        amiri: ['Amiri', 'Georgia', 'serif'],
        sans: ['Cairo', 'Segoe UI', 'Tahoma', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: {
          DEFAULT: '#1A1A1A',
          soft: '#3D3D3D',
          muted: '#6B6B6B',
          faint: '#9A9A9A',
        },
        page: {
          DEFAULT: '#F7F6F3',
          raised: '#FFFFFF',
          sunken: '#EFEEEA',
          line: '#E2E0DA',
        },
        accent: {
          DEFAULT: '#0F5C5C',
          soft: '#E6F2F2',
          mid: '#1A7A7A',
          deep: '#0A4545',
        },
      },
      keyframes: {
        'fade-pane': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'reveal-answer': {
          from: { opacity: '0', maxHeight: '0' },
          to: { opacity: '1', maxHeight: '12rem' },
        },
      },
      animation: {
        'fade-pane': 'fade-pane 220ms ease-out',
        'reveal-answer': 'reveal-answer 280ms ease-out',
      },
    },
  },
  plugins: [],
};
