import { sql } from 'drizzle-orm';
import { db } from './db';
import { users, userSettings, habitGroups, habits, timers } from './schema';
import { hashPassword, newId } from './auth';

export const DEFAULT_SETTINGS = {
  theme: 'night' as const, // default theme
  accent: 'blue' as const, // cobalt
  sound: true,
  voice: false,
  beeps: true,
  keepAwake: true,
  volume: 100, // master output level, percent (0–200)
  prepSeconds: 5, // "get ready" countdown before a focus habit starts
  weekStart: 1, // Monday
  pomodoro: { work: 25, short: 5, long: 20, longEvery: 4, rounds: 4 },
};

/** Seed the single account + default habits on first boot (closed signup). */
export function bootstrap(): void {
  const userCount = db.select({ n: sql<number>`count(*)` }).from(users).get();
  if (userCount && userCount.n > 0) return;

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn('[seed] No users and ADMIN_EMAIL/ADMIN_PASSWORD unset — skipping bootstrap.');
    return;
  }

  const now = Date.now();
  const userId = newId();
  db.insert(users)
    .values({ id: userId, email: email.toLowerCase(), passwordHash: hashPassword(password), createdAt: now })
    .run();
  db.insert(userSettings).values({ userId, data: DEFAULT_SETTINGS }).run();

  const groups = [
    { name: 'Morning', emoji: '☀️', weekdaysOnly: false },
    { name: 'Work', emoji: '💼', weekdaysOnly: true },
    { name: 'Night', emoji: '🌙', weekdaysOnly: false },
  ].map((g, i) => ({ id: newId(), userId, name: g.name, emoji: g.emoji, weekdaysOnly: g.weekdaysOnly, sortOrder: i }));
  db.insert(habitGroups).values(groups).run();
  const [morning, work, night] = groups;

  // Time habits get a 20 min/day goal by default; Math Training is a shorter 5.
  // The two Night abstinence habits ('abstain' kind) are end-of-day doomscroll
  // checks — no timer, no goal: you mark "stayed off it" to build a clean streak.
  const seedHabits = [
    { g: morning, name: 'LeetCode', emoji: '⚔️', note: 'study / init implementation', durations: [5, 10, 15, 20, 25, 30], def: 15, kind: 'time', goal: 20 },
    { g: work, name: 'Math Training', emoji: '🧮', note: null, durations: [5, 10, 15, 20], def: 10, kind: 'time', goal: 5 },
    { g: work, name: 'Anki', emoji: '🧠', note: null, durations: [5, 10, 15, 20], def: 15, kind: 'time', goal: 20 },
    { g: work, name: 'Prog. Read', emoji: '💻', note: null, durations: [5, 10, 15, 20], def: 10, kind: 'time', goal: 20 },
    { g: work, name: 'LeetCode', emoji: '⚔️', note: 'review / build from memory', durations: [5, 10, 15, 20, 25, 30], def: 15, kind: 'time', goal: 20 },
    { g: night, name: 'Journaling', emoji: '✍️', note: 'in French', durations: [5, 10, 15, 20], def: 10, kind: 'time', goal: 20 },
    { g: night, name: 'Reading', emoji: '📖', note: 'meaning + pronunciation', durations: [5, 10, 15, 20, 25, 30], def: 20, kind: 'time', goal: 20 },
    { g: night, name: 'App P', emoji: 'phone-off', note: "End of day: confirm you didn't doomscroll", durations: [20], def: null, kind: 'abstain', goal: null },
    { g: night, name: 'App I', emoji: 'phone-off', note: "End of day: confirm you didn't doomscroll", durations: [20], def: null, kind: 'abstain', goal: null },
  ];
  db.insert(habits)
    .values(
      seedHabits.map((h, i) => ({
        id: newId(),
        userId,
        groupId: h.g.id,
        name: h.name,
        emoji: h.emoji,
        note: h.note,
        kind: h.kind,
        durations: h.durations,
        defaultDurationMin: h.def,
        dailyGoalMin: h.goal,
        sortOrder: i,
        archived: false,
        createdAt: now,
      })),
    )
    .run();

  // A couple of example interval presets so the Timers library isn't empty.
  db.insert(timers)
    .values([
      {
        id: newId(), userId, name: 'Tabata', type: 'interval', sortOrder: 0, archived: false,
        createdAt: now, updatedAt: now,
        config: {
          prepSeconds: 10, sets: 8, cooldownSeconds: 0,
          intervals: [
            { label: 'Work', seconds: 20, kind: 'work', color: '#22c55e', sound: 'work' },
            { label: 'Rest', seconds: 10, kind: 'rest', color: '#3b82f6', sound: 'rest' },
          ],
          sounds: { countdownBeeps: true, voice: false },
        },
      },
      {
        id: newId(), userId, name: 'HIIT 5 × 40/20', type: 'interval', sortOrder: 1, archived: false,
        createdAt: now, updatedAt: now,
        config: {
          prepSeconds: 15, sets: 5, cooldownSeconds: 30,
          intervals: [
            { label: 'Work', seconds: 40, kind: 'work', color: '#22c55e', sound: 'work' },
            { label: 'Rest', seconds: 20, kind: 'rest', color: '#3b82f6', sound: 'rest' },
          ],
          sounds: { countdownBeeps: true, voice: true },
        },
      },
    ])
    .run();

  console.log(`[seed] Created account ${email} with ${seedHabits.length} habits.`);
}
