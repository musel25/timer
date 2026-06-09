import type { AccentName } from './types';

export const ACCENTS: { name: AccentName; label: string; rgb: string }[] = [
  { name: 'teal', label: 'Teal', rgb: 'rgb(20 184 166)' },
  { name: 'blue', label: 'Blue', rgb: 'rgb(59 130 246)' },
  { name: 'green', label: 'Green', rgb: 'rgb(34 197 94)' },
  { name: 'violet', label: 'Violet', rgb: 'rgb(139 92 246)' },
  { name: 'rose', label: 'Rose', rgb: 'rgb(244 63 94)' },
  { name: 'amber', label: 'Amber', rgb: 'rgb(245 158 11)' },
];

export function applyAccent(accent: AccentName): void {
  document.documentElement.setAttribute('data-accent', accent);
}
