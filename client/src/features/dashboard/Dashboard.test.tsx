import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Dashboard } from './Dashboard';
import { dayKey } from '../../lib/time';
import type { Habit, Session } from '../../lib/types';

const { data } = vi.hoisted(() => ({ data: { habits: [] as Habit[], sessions: [] as Session[], rest: [] as { date: string }[] } }));
vi.mock('../../lib/hooks', () => ({
  useHabits: () => ({ data: data.habits }), useGroups: () => ({ data: [] }),
  useSessions: () => ({ data: data.sessions }), useRestDays: () => ({ data: data.rest }),
  useVacationDays: () => ({ data: [] }), useSettings: () => ({ data: { weekStart: 1 } }),
  useLogSession: () => ({ mutate: vi.fn() }), useDeleteSession: () => ({ mutate: vi.fn() }),
}));
const habit: Habit = { id: 'reading', name: 'Read', kind: 'time', durations: [10], defaultDurationMin: 10, dailyGoalMin: null, weekendGoalMin: null, vacationGoalMin: null, emoji: null, note: null, groupId: null, sortOrder: 0, archived: false, hiddenOn: null, createdAt: 0 };
const now = Date.now();
describe('habit dashboard daily summary', () => {
  beforeEach(() => {
    data.habits = [habit, { ...habit, id: 'check', name: 'Walk', kind: 'check' }];
    data.sessions = [{ id: 'session', habitId: 'check', timerId: null, label: null, type: 'simple', plannedSeconds: 0, actualSeconds: 0, completed: true, startedAt: now, endedAt: now, note: null, createdAt: now }];
    data.rest = [];
  });
  it('can reach full completion when an optional time habit has no goal', () => {
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(screen.getByText('1 of 1 daily habits complete')).toBeDefined();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuemax')).toBe('1');
  });
  it('shows a rest day without an unmet completion target', () => {
    data.rest = [{ date: dayKey(now) }];
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(screen.getByText('Rest day — no daily targets')).toBeDefined();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});
