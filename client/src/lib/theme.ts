import type { AccentName, ThemeName } from './types';

export const ACCENTS: { name: AccentName; label: string; rgb: string }[] = [
  { name: 'teal', label: 'Teal', rgb: 'rgb(12 124 113)' },
  { name: 'blue', label: 'Cobalt', rgb: 'rgb(69 97 204)' },
  { name: 'green', label: 'Green', rgb: 'rgb(22 126 85)' },
  { name: 'violet', label: 'Violet', rgb: 'rgb(102 84 217)' },
  { name: 'rose', label: 'Rose', rgb: 'rgb(191 53 90)' },
  { name: 'amber', label: 'Amber', rgb: 'rgb(150 100 17)' },
];

export function applyAccent(accent: AccentName): void {
  document.documentElement.setAttribute('data-accent', accent);
}

export const THEMES: { name: ThemeName; label: string; icon: 'moon' | 'sun' }[] = [
  { name: 'night', label: 'Night', icon: 'moon' },
  { name: 'day', label: 'Day', icon: 'sun' },
];

/** Page-chrome color per theme (browser status bar / address bar tint). */
const THEME_CHROME: Record<ThemeName, string> = { night: '#161923', day: '#f5f6fa' };

export function applyTheme(theme: ThemeName): void {
  // Anything that isn't an explicit 'day' is treated as night (also migrates
  // the legacy 'dark' value transparently).
  const t: ThemeName = theme === 'day' ? 'day' : 'night';
  document.documentElement.setAttribute('data-theme', t);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_CHROME[t]);
}
