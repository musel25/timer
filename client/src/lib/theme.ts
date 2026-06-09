import type { AccentName, ThemeName } from './types';

export const ACCENTS: { name: AccentName; label: string; rgb: string }[] = [
  { name: 'teal', label: 'Teal', rgb: 'rgb(20 184 166)' },
  { name: 'blue', label: 'Cobalt', rgb: 'rgb(58 109 240)' },
  { name: 'green', label: 'Green', rgb: 'rgb(22 160 107)' },
  { name: 'violet', label: 'Violet', rgb: 'rgb(124 92 246)' },
  { name: 'rose', label: 'Rose', rgb: 'rgb(225 45 85)' },
  { name: 'amber', label: 'Amber', rgb: 'rgb(200 131 26)' },
];

export function applyAccent(accent: AccentName): void {
  document.documentElement.setAttribute('data-accent', accent);
}

export const THEMES: { name: ThemeName; label: string; icon: string }[] = [
  { name: 'night', label: 'Night', icon: '🌙' },
  { name: 'day', label: 'Day', icon: '☀️' },
];

/** Page-chrome color per theme (browser status bar / address bar tint). */
const THEME_CHROME: Record<ThemeName, string> = { night: '#0b0f14', day: '#fbfbfd' };

export function applyTheme(theme: ThemeName): void {
  // Anything that isn't an explicit 'day' is treated as night (also migrates
  // the legacy 'dark' value transparently).
  const t: ThemeName = theme === 'day' ? 'day' : 'night';
  document.documentElement.setAttribute('data-theme', t);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_CHROME[t]);
}
