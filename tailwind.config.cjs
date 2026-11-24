/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Pretendard',
          'Pretendard Variable',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'Apple SD Gothic Neo',
          'Malgun Gothic',
          'sans-serif',
        ],
      },
      colors: {
        bg: '#0D0F17',
        surf: '#161A26',
        raised: '#1E2333',
        line: '#2A3146',
        ink: '#F5F6FC',
        sub: '#8C95B0',
        purple: '#A855F7',
        violet: '#7C5CFF',
        rose: '#FB7185',
        mint: '#10B981',
        amber: '#FBBF24',
      },
      boxShadow: {
        card: '0 18px 40px -24px rgba(0,0,0,0.95)',
        glow: '0 0 40px -12px rgba(168,85,247,0.55)',
        glowRose: '0 0 40px -12px rgba(251,113,133,0.55)',
        glowMint: '0 0 40px -12px rgba(16,185,129,0.5)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'pop-in': {
          from: { opacity: '0', transform: 'translateY(12px) scale(0.97)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'rise-in': {
          from: { opacity: '0', transform: 'translateY(22px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%': { transform: 'translateX(-6px)' },
          '40%': { transform: 'translateX(6px)' },
          '60%': { transform: 'translateX(-4px)' },
          '80%': { transform: 'translateX(4px)' },
        },
        'float-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '20%': { opacity: '1' },
          '100%': { opacity: '0', transform: 'translateY(-46px)' },
        },
        'spin-slow': { to: { transform: 'rotate(360deg)' } },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out',
        'pop-in': 'pop-in 260ms cubic-bezier(0.22, 1, 0.36, 1)',
        'rise-in': 'rise-in 320ms cubic-bezier(0.22, 1, 0.36, 1)',
        'pulse-soft': 'pulse-soft 1.6s ease-in-out infinite',
        shake: 'shake 400ms ease-in-out',
        'float-up': 'float-up 1200ms ease-out forwards',
        'spin-slow': 'spin-slow 14s linear infinite',
      },
    },
  },
  plugins: [],
};
