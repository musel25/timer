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
        // `ink-*` = surfaces. Remapped dark->light so existing bg-ink-* classes
        // become light surfaces with no per-component edits.
        // ink-900 (was darkest page bg) -> lightest; used as text color only on
        // accent buttons, where near-white-on-accent is correct.
        ink: {
          900: '#fbfbfd', // page background
          800: '#ffffff', // card / surface
          700: '#f3f4f7', // subtle fill (chips, sidebar)
          600: '#e9ebef', // border
          500: '#a2a8b5', // faint border / disabled
        },
        // `slate-*` = text. Remapped to dark-on-light so existing text-slate-*
        // classes read correctly on a light background.
        slate: {
          100: '#1b1c22', // primary text
          200: '#2b2d36',
          300: '#4b5160',
          400: '#6b7180', // muted text
          500: '#9aa0ad', // faint text
          600: '#a2a8b5',
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
