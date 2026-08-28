import type { EntryTemplate } from '../../lib/types';

/**
 * Entry templates: the structured questions a completion asks. Defined as data
 * so adding one is an edit here rather than a new component — `EntryForm`
 * renders any of them.
 */

export type FieldType = 'text' | 'line' | 'scale' | 'choice' | 'minutes';

export interface Field {
  id: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  /** scale only */
  min?: number;
  max?: number;
  /** choice only */
  options?: string[];
  /** Blocks submission while empty. Everything else may be left blank. */
  required?: boolean;
}

export interface Template {
  id: EntryTemplate;
  title: string;
  fields: Field[];
  /** Optional prompt shown above the fields (the journal's theme of the day). */
  prompt?: { theme: string; questions: string[] };
  /** Collapsed "need an idea?" list. */
  ideas?: { heading: string; items: string[] }[];
}

/**
 * The journal's rotating theme, so journaling has a purpose beyond "write about
 * my day" without asking ten questions every night.
 *
 * Sunday is deliberately not a reflection theme: "best / worst / learned /
 * change next week" is the Weekly review habit, anchored to Sunday with its own
 * template. One prompt on Sunday, not two — so Sunday journaling is free-form
 * and the daily streak stays intact.
 */
export const JOURNAL_THEMES: Record<number, { theme: string; questions: string[] }> = {
  0: {
    theme: 'Free write',
    questions: ['Anything on your mind — the week itself is covered by the Weekly review habit.'],
  },
  1: {
    theme: 'Self-awareness',
    questions: ['What affected me today?', 'Why?', 'What am I avoiding?', 'Did I notice any recurring pattern?'],
  },
  2: {
    theme: 'Beliefs',
    questions: ['What might I be wrong about?', 'Did something challenge one of my assumptions?', 'What evidence would change my mind?'],
  },
  3: {
    theme: 'Character / ethics',
    questions: ['Did I act like the person I want to be?', 'Where was I selfish, dishonest, avoidant, impatient, brave, generous?', 'What would I do differently?'],
  },
  4: {
    theme: 'Gratitude / appreciation',
    questions: ['What did I enjoy today?', 'What am I taking for granted?', 'What would I miss if I suddenly lost it?'],
  },
  5: {
    theme: 'Problems / decisions',
    questions: ['What problem keeps coming back?', 'What am I postponing?', 'What is the next concrete action?'],
  },
  6: {
    theme: 'Curiosity',
    questions: ['What interesting thing did I learn?', 'What question have I been thinking about?', 'What do I want to understand better?'],
  },
};

/** The nine areas of the monthly life review, rated 0–10. */
export const LIFE_AREAS = [
  'Health', 'Relationships', 'Work / career', 'Learning', 'Fun',
  'Creativity', 'Money', 'Environment / home', 'Personal growth',
] as const;

const SIMPLIFY_OPTIONS = [
  'Possessions', 'Subscriptions', 'Apps', 'Notifications', 'Commitments',
  'Unfinished tasks', 'Files / photos', 'Email', 'Routines', 'Goals',
];

const COURAGE_IDEAS = [
  {
    heading: 'Social',
    items: [
      'Start a conversation', 'Message someone first', 'Call instead of texting',
      'Ask someone to do something', 'Speak up in a group', 'Attend something alone',
      'Ask a question despite worrying it sounds stupid', 'Give a compliment',
      'Introduce yourself to someone',
    ],
  },
  {
    heading: 'Non-social',
    items: [
      'Do something you have been procrastinating', 'Make an uncomfortable phone call',
      'Ask for something you want', 'Say no to something',
      'Share work before you think it is perfect', 'Try something you are afraid you will be bad at',
      'Have a conversation you have been avoiding', 'Go somewhere unfamiliar alone',
    ],
  },
];

const scale = (id: string, label: string, min: number, max: number): Field => ({ id, label, type: 'scale', min, max });

const TEMPLATES: Record<EntryTemplate, Template> = {
  journal: {
    id: 'journal',
    title: 'Journal',
    fields: [
      { id: 'minutes', label: 'Minutes', type: 'minutes' },
      { id: 'text', label: 'Entry', type: 'text', placeholder: 'Write freely — the questions are a nudge, not a form.' },
    ],
  },
  read: {
    id: 'read',
    title: 'Read',
    fields: [
      { id: 'minutes', label: 'Minutes', type: 'minutes' },
      { id: 'book', label: 'Book', type: 'line', placeholder: 'Title' },
    ],
  },
  leetcode: {
    id: 'leetcode',
    title: 'LeetCode',
    fields: [
      { id: 'minutes', label: 'Minutes', type: 'minutes' },
      { id: 'problem', label: 'Problem', type: 'line', placeholder: 'e.g. 146. LRU Cache' },
      { id: 'difficulty', label: 'Difficulty', type: 'choice', options: ['Easy', 'Medium', 'Hard'] },
    ],
  },
  courage: {
    id: 'courage',
    title: 'Something uncomfortable',
    fields: [
      { id: 'what', label: 'What did I do?', type: 'text', required: true, placeholder: 'The uncomfortable thing.' },
      scale('anticipated', 'Anticipated discomfort', 1, 5),
      scale('actual', 'Actual discomfort', 1, 5),
    ],
    ideas: COURAGE_IDEAS,
  },
  'weekly-review': {
    id: 'weekly-review',
    title: 'Weekly review',
    fields: [
      { id: 'best', label: 'Best thing this week?', type: 'text' },
      { id: 'worst', label: 'Worst?', type: 'text' },
      { id: 'learned', label: 'What did I learn?', type: 'text' },
      { id: 'change', label: 'What should I change next week?', type: 'text' },
    ],
  },
  'life-review': {
    id: 'life-review',
    title: 'Monthly life review',
    fields: [
      ...LIFE_AREAS.map((a) => scale(`rate:${a}`, a, 0, 10)),
      { id: 'improved', label: 'What improved?', type: 'text' },
      { id: 'worse', label: 'What got worse?', type: 'text' },
      { id: 'tooMuch', label: 'What am I spending too much time on?', type: 'text' },
      { id: 'neglected', label: 'What am I neglecting?', type: 'text' },
      { id: 'moreOf', label: 'What do I want more of next month?', type: 'text' },
      { id: 'lessOf', label: 'What do I want less of?', type: 'text' },
      { id: 'change', label: 'One concrete change for next month.', type: 'text', required: true },
    ],
  },
  simplify: {
    id: 'simplify',
    title: 'Simplify one thing',
    fields: [
      { id: 'area', label: 'What did I simplify?', type: 'choice', options: SIMPLIFY_OPTIONS, required: true },
      { id: 'note', label: 'What did I actually do?', type: 'text' },
    ],
  },
};

/**
 * The template a habit opens, with the journal's theme resolved for `ts`'s
 * weekday. Returns null for a habit with no template — those log with a plain
 * "done + optional note" composer.
 */
export function templateFor(id: string | null | undefined, ts = Date.now()): Template | null {
  if (!id) return null;
  const t = TEMPLATES[id as EntryTemplate];
  if (!t) return null; // unknown id from a stale cached row — degrade to the plain composer
  if (t.id !== 'journal') return t;
  return { ...t, prompt: JOURNAL_THEMES[new Date(ts).getDay()] };
}

/** Ids of every template, for the habit editor's picker. */
export const TEMPLATE_IDS = Object.keys(TEMPLATES) as EntryTemplate[];
export const templateTitle = (id: EntryTemplate) => TEMPLATES[id].title;
