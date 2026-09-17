import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DayMarkerCalendar } from './DayMarkerCalendar';

const { vacationMutate, restMutate } = vi.hoisted(() => ({
  vacationMutate: vi.fn(),
  restMutate: vi.fn(),
}));

let vacationRows: { date: string }[] = [];

vi.mock('../../lib/hooks', () => ({
  useSettings: () => ({ data: { weekStart: 1 } }),
  useVacationDays: () => ({ data: vacationRows }),
  useRestDays: () => ({ data: [] }),
  useSetVacationRange: () => ({ mutate: vacationMutate }),
  useSetRestRange: () => ({ mutate: restMutate }),
}));

/** A day button in the currently shown month, by its number. */
const day = (n: number) => screen.getAllByText(String(n))[0];

describe('DayMarkerCalendar', () => {
  beforeEach(() => {
    vacationRows = [];
    vacationMutate.mockClear();
    restMutate.mockClear();
  });

  it('marks the inclusive range between the two days tapped', () => {
    render(<DayMarkerCalendar />);
    fireEvent.click(day(10));
    expect(vacationMutate).not.toHaveBeenCalled(); // one tap only arms the range
    fireEvent.click(day(14));
    const { start, end, on } = vacationMutate.mock.calls[0][0];
    expect({ on, span: [start.slice(-2), end.slice(-2)] }).toEqual({ on: true, span: ['10', '14'] });
  });

  it('marks the same range when the days are tapped backwards', () => {
    render(<DayMarkerCalendar />);
    fireEvent.click(day(14));
    fireEvent.click(day(10));
    const { start, end } = vacationMutate.mock.calls[0][0];
    expect([start.slice(-2), end.slice(-2)]).toEqual(['10', '14']);
  });

  it('clears a single day that is already marked', () => {
    const d = new Date();
    const marked = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-12`;
    vacationRows = [{ date: marked }];
    render(<DayMarkerCalendar />);
    fireEvent.click(day(12));
    expect(vacationMutate).toHaveBeenCalledWith({ start: marked, end: marked, on: false });
  });

  it('paints rest days once the Rest mode is chosen — the vacation range is left alone', () => {
    render(<DayMarkerCalendar />);
    fireEvent.click(screen.getByText('Rest'));
    fireEvent.click(day(10));
    fireEvent.click(day(11));
    expect(vacationMutate).not.toHaveBeenCalled();
    expect(restMutate.mock.calls[0][0].on).toBe(true);
  });

  it('drops a half-made range when the month changes, so it cannot span a month by accident', () => {
    render(<DayMarkerCalendar />);
    fireEvent.click(day(10));
    fireEvent.click(screen.getByLabelText('Next month'));
    fireEvent.click(day(14));
    expect(vacationMutate).not.toHaveBeenCalled(); // 14th only re-arms the range
  });
});
