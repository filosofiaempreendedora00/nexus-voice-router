import typography from '@tailwindcss/typography'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0A0A0B',
          subtle: '#111114',
          elevated: '#17171B',
          hover: '#1C1C21'
        },
        line: {
          DEFAULT: '#26262C',
          strong: '#33333A'
        },
        ink: {
          DEFAULT: '#F5F5F7',
          muted: '#9A9AA3',
          dim: '#6E6E78'
        },
        accent: {
          DEFAULT: '#6366F1',
          hover: '#7C7FF6',
          subtle: 'rgba(99, 102, 241, 0.12)'
        },
        success: '#22C55E',
        warning: '#F59E0B',
        danger: '#EF4444'
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Display',
          'Segoe UI',
          'system-ui',
          'sans-serif'
        ],
        mono: ['JetBrains Mono', 'SF Mono', 'Menlo', 'monospace']
      },
      animation: {
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'fade-in': 'fadeIn 200ms ease-out',
        'slide-up': 'slideUp 240ms cubic-bezier(0.16, 1, 0.3, 1)'
      },
      keyframes: {
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' }
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' }
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        }
      }
    }
  },
  plugins: [typography]
}
