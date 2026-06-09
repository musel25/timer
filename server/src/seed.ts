import { sql } from 'drizzle-orm';
import { db } from './db';
import { users, userSettings, habitGroups, habits, timers } from './schema';
import { hashPassword, newId } from './auth';

export const DEFAULT_SETTINGS = {
  theme: 'dark' as const,
  accent: 'blue' as const, // cobalt — the Daylight default
  sound: true,
  voice: false,
  beeps: true,
  keepAwake: true,
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
    { name: 'Morning', emoji: '☀️' },
    { name: 'Work', emoji: '💼' },
    { name: 'Night', emoji: '🌙' },
  ].map((g, i) => ({ id: newId(), userId, name: g.name, emoji: g.emoji, sortOrder: i }));
  db.insert(habitGroups).values(groups).run();
  const [morning, work, night] = groups;

  const seedHabits = [
    { g: morning, name: 'LeetCode', emoji: '⚔️', note: 'study / init implementation', durations: [5, 10, 15, 20, 25, 30], def: 15 },
    { g: work, name: 'Math Training', emoji: '🧮', note: null, durations: [5, 10, 15, 20], def: 10 },
    { g: work, name: 'Anki', emoji: '🧠', note: null, durations: [5, 10, 15, 20], def: 15 },
    { g: work, name: 'Prog. Read', emoji: '💻', note: null, durations: [5, 10, 15, 20], def: 10 },
    { g: work, name: 'LeetCode', emoji: '⚔️', note: 'review / build from memory', durations: [5, 10, 15, 20, 25, 30], def: 15 },
    { g: night, name: 'Journaling', emoji: '✍️', note: 'in French', durations: [5, 10, 15, 20], def: 10 },
    { g: night, name: 'Reading', emoji: '📖', note: 'meaning + pronunciation', durations: [5, 10, 15, 20, 25, 30], def: 20 },
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
        durations: h.durations,
        defaultDurationMin: h.def,
        dailyGoalMin: null,
        timerType: 'simple',
        defaultTimerId: null,
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
