import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HabitCard } from './HabitCard';
import type { Habit } from '../../lib/types';

const habit: Habit = { id: 'read', name: 'Read', kind: 'time', durations: [10], defaultDurationMin: 10, dailyGoalMin: 20, weekendGoalMin: null, vacationGoalMin: null, emoji: null, note: null, groupId: null, sortOrder: 0, archived: false, hiddenOn: null, createdAt: 0 };

describe('habit row logging', () => {
  it('supports quick logging and a custom amount without losing the daily goal', () => {
    const log = vi.fn();
    render(<HabitCard habit={habit} minutesToday={5} onLog={log} />);
    expect(screen.getByText('5/20m')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Log 10 minutes' }));
    expect(log).toHaveBeenCalledWith(habit, expect.objectContaining({ minutes: 10, note: null }));
    fireEvent.click(screen.getByRole('button', { name: 'Custom log' }));
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log' }));
    expect(log).toHaveBeenLastCalledWith(habit, expect.objectContaining({ minutes: 25 }));
    expect(screen.queryByLabelText('Minutes')).toBeNull();
  });

  it('opens the entry form for a check habit and can undo its completion', () => {
    const open = vi.fn();
    const undo = vi.fn();
    const check = { ...habit, kind: 'check' as const };
    const { rerender } = render(<HabitCard habit={check} minutesToday={0} onOpenEntry={open} onToggle={undo} />);
    fireEvent.click(screen.getByRole('button', { name: 'Log entry' }));
    expect(open).toHaveBeenCalledWith(check);
    rerender(<HabitCard habit={check} minutesToday={0} onOpenEntry={open} onToggle={undo} markedToday />);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(undo).toHaveBeenCalledWith(check);
  });
});
