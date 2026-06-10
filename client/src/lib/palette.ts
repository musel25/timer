/**
 * Per-category color palette. Each habit gets a stable color derived from its id
 * (no DB column needed), used to tint its icon chip, done states, and card accent.
 * Colors are stored as "R G B" so they compose with alpha in inline styles.
 */
export interface CategoryColor {
  name: string;
  rgb: string; // "R G B"
}

export const CATEGORY_COLORS: CategoryColor[] = [
  { name: 'violet', rgb: '124 92 246' },
  { name: 'blue', rgb: '58 109 240' },
  { name: 'cyan', rgb: '6 182 212' },
  { name: 'teal', rgb: '20 184 166' },
  { name: 'green', rgb: '22 160 107' },
  { name: 'amber', rgb: '217 144 30' },
  { name: 'rose', rgb: '225 45 85' },
  { name: 'indigo', rgb: '99 102 241' },
];

/** Small, stable string hash (djb2-ish). */
function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Deterministic color for a habit/group from its id. */
export function categoryColor(id: string | null | undefined): CategoryColor {
  if (!id) return CATEGORY_COLORS[0];
  return CATEGORY_COLORS[hash(id) % CATEGORY_COLORS.length];
}

/** Inline-style helpers built from a CategoryColor (or any "R G B" string). */
export const tint = (rgb: string, a = 0.12) => `rgb(${rgb} / ${a})`;
export const solid = (rgb: string) => `rgb(${rgb})`;
/** A soft diagonal gradient for icon chips / accents. */
export const gradient = (rgb: string, a1 = 0.9, a2 = 0.55) =>
  `linear-gradient(135deg, rgb(${rgb} / ${a1}), rgb(${rgb} / ${a2}))`;
