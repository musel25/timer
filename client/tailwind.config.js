/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Accent stays CSS-variable driven so it remains user-customizable.
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          soft: 'rgb(var(--accent) / 0.10)',
        },
        // `ink-*` = surfaces, `slate-*` = text — both CSS-variable driven so the
        // whole app switches between the Night and Day themes via `data-theme`
        // (values defined in index.css), the same pattern the accent uses.
        ink: {
          900: 'rgb(var(--ink-900) / <alpha-value>)', // page background
          800: 'rgb(var(--ink-800) / <alpha-value>)', // card / surface
          700: 'rgb(var(--ink-700) / <alpha-value>)', // subtle fill (chips, sidebar)
          600: 'rgb(var(--ink-600) / <alpha-value>)', // border
          500: 'rgb(var(--ink-500) / <alpha-value>)', // faint border / disabled
        },
        slate: {
          100: 'rgb(var(--slate-100) / <alpha-value>)', // primary text
          200: 'rgb(var(--slate-200) / <alpha-value>)',
          300: 'rgb(var(--slate-300) / <alpha-value>)',
          400: 'rgb(var(--slate-400) / <alpha-value>)', // muted text
          500: 'rgb(var(--slate-500) / <alpha-value>)', // faint text
          600: 'rgb(var(--slate-600) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['General Sans', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 4px 20px rgba(20, 30, 60, 0.05)',
      },
    },
  },
  plugins: [],
};
