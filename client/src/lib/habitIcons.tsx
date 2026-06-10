import {
  Swords, Brain, Code, BookOpen, PenLine, Footprints, Flower2, Guitar, Dumbbell, Salad,
  Moon, Sun, Timer, Pin, Calculator, Languages, Music, Palette, Heart, Briefcase,
  GraduationCap, Coffee, Bike, Sprout, Flame, Target, type LucideIcon,
} from 'lucide-react';

/** Curated set of habit/group icons, keyed by lucide's kebab-case id. */
export const HABIT_ICONS: Record<string, LucideIcon> = {
  swords: Swords,
  brain: Brain,
  code: Code,
  'book-open': BookOpen,
  'pen-line': PenLine,
  footprints: Footprints,
  flower: Flower2,
  guitar: Guitar,
  dumbbell: Dumbbell,
  salad: Salad,
  moon: Moon,
  sun: Sun,
  timer: Timer,
  pin: Pin,
  calculator: Calculator,
  languages: Languages,
  music: Music,
  palette: Palette,
  heart: Heart,
  briefcase: Briefcase,
  'graduation-cap': GraduationCap,
  coffee: Coffee,
  bike: Bike,
  sprout: Sprout,
  flame: Flame,
  target: Target,
};

export const HABIT_ICON_NAMES = Object.keys(HABIT_ICONS);

/** Map the emojis that seeded older habits/groups onto curated icons, so existing
 *  data renders as crisp SVGs without a migration. */
export const LEGACY_EMOJI_TO_ICON: Record<string, string> = {
  '⚔️': 'swords',
  '🧮': 'calculator',
  '🧠': 'brain',
  '💻': 'code',
  '📖': 'book-open',
  '✍️': 'pen-line',
  '🏃': 'footprints',
  '🧘': 'flower',
  '🎸': 'guitar',
  '💪': 'dumbbell',
  '🥗': 'salad',
  '🌙': 'moon',
  '☀️': 'sun',
  '⏱': 'timer',
  '📌': 'pin',
  '🌱': 'sprout',
  '🔥': 'flame',
};

/** The default icon id for a brand-new habit/group. */
export const DEFAULT_HABIT_ICON = 'timer';

function resolveIcon(value: string | null | undefined): LucideIcon | null {
  if (!value) return null;
  if (HABIT_ICONS[value]) return HABIT_ICONS[value];
  const mapped = LEGACY_EMOJI_TO_ICON[value];
  if (mapped) return HABIT_ICONS[mapped];
  return null;
}

/** Renders a habit/group icon. Accepts a curated icon id, a legacy emoji (mapped),
 *  or any other string (rendered verbatim as a fallback). */
export function HabitIcon({ name, className, size = 18 }: { name: string | null | undefined; className?: string; size?: number }) {
  const Icon = resolveIcon(name);
  if (Icon) return <Icon size={size} className={className} strokeWidth={2} />;
  return <span className={className}>{name}</span>;
}
