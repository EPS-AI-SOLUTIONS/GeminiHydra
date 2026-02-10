/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        'matrix-bg-primary': 'var(--matrix-bg-primary)',
        'matrix-bg-secondary': 'var(--matrix-bg-secondary)',
        'matrix-bg-tertiary': 'var(--matrix-bg-tertiary)',
        'matrix-accent': 'var(--matrix-accent)',
        'matrix-accent-dim': 'var(--matrix-accent-dim)',
        'matrix-accent-glow': 'var(--matrix-accent-glow)',
        'matrix-text': 'var(--matrix-text-primary)',
        'matrix-text-dim': 'var(--matrix-text-secondary)',
        'matrix-border': 'var(--matrix-border)',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      backdropBlur: {
        xs: '2px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'shimmer': 'shimmer 1.5s infinite',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px var(--matrix-accent-glow)' },
          '100%': { boxShadow: '0 0 20px var(--matrix-accent-glow)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      boxShadow: {
        'matrix-glow': '0 0 20px var(--matrix-accent-glow)',
        'matrix-glow-sm': '0 0 10px var(--matrix-accent-glow)',
        'glass': '0 8px 32px rgba(0, 0, 0, 0.3)',
      },
    },
  },
  plugins: [],
};
