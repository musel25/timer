import type { AccentName } from './types';

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
