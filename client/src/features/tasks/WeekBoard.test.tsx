import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// jsdom ships neither PointerEvent nor TouchEvent, and without them fireEvent
// falls back to a bare Event that dnd-kit's sensors ignore — the board would
// look tap-safe in tests no matter how broken it is on a phone. Minimal
// polyfills so the sensors see what a mobile browser would send.
class PointerEventPolyfill extends MouseEvent {
  isPrimary: boolean;
  pointerId: number;
  pointerType: string;
  constructor(type: string, params: any = {}) {
    super(type, params);
    this.isPrimary = params.isPrimary ?? false;
    this.pointerId = params.pointerId ?? 0;
    this.pointerType = params.pointerType ?? '';
  }
}
class TouchEventPolyfill extends UIEvent {
  touches: any[];
  changedTouches: any[];
  targetTouches: any[];
  constructor(type: string, params: any = {}) {
    super(type, params);
    this.touches = params.touches ?? [];
    this.changedTouches = params.changedTouches ?? [];
    this.targetTouches = params.targetTouches ?? [];
  }
}
(window as any).PointerEvent = PointerEventPolyfill;
(window as any).TouchEvent = TouchEventPolyfill;
import { WeekBoard } from './WeekBoard';
import { todayKey } from '../../lib/date';
import type { Task } from '../../lib/types';

const { toggleMutate, saveMutate } = vi.hoisted(() => ({
  toggleMutate: vi.fn(),
  saveMutate: vi.fn(),
}));

vi.mock('../../lib/hooks', () => ({
  useTasks: () => ({ data: tasks }),
  useSessions: () => ({ data: [] }),
  useRestDays: () => ({ data: [] }),
  useCalendarEvents: () => ({ data: [] }),
  useSaveTask: () => ({ mutate: saveMutate, mutateAsync: saveMutate }),
  useReorderTasks: () => ({ mutate: vi.fn() }),
  useToggleTask: () => ({ mutate: toggleMutate }),
  useDeleteTask: () => ({ mutate: vi.fn() }),
  useTaskAttachments: () => ({ data: [] }),
  useUploadAttachment: () => ({ mutateAsync: vi.fn() }),
  useDeleteAttachment: () => ({ mutate: vi.fn() }),
}));

const tasks: Task[] = [
  {
    id: 't1',
    title: 'Buy milk',
    notes: null,
    date: todayKey(),
    done: false,
    completedAt: null,
    hiddenOn: null,
    archivedAt: null,
    sortOrder: 1,
    createdAt: 0,
  },
];

/** The event storm a phone fires for one tap: pointer events first, the touch
 *  events they mirror, then the compatibility click. `wiggle` is the few px a
 *  fingertip rolls between touch-down and lift-off — nobody taps at exactly
 *  one coordinate, so a realistic tap must survive it. */
function touchTap(el: HTMLElement, wiggle = 8) {
  const from = { clientX: 40, clientY: 40 };
  const to = { clientX: 40 + wiggle, clientY: 40 };
  fireEvent.pointerDown(el, { ...from, pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0 });
  fireEvent.touchStart(el, { touches: [from] });
  if (wiggle) {
    fireEvent.pointerMove(el, { ...to, pointerId: 1, pointerType: 'touch', isPrimary: true });
    fireEvent.touchMove(el, { touches: [to] });
  }
  fireEvent.pointerUp(el, { ...to, pointerId: 1, pointerType: 'touch', isPrimary: true });
  fireEvent.touchEnd(el, { changedTouches: [to] });
  fireEvent.click(el, { ...to, detail: 1 });
}

describe('WeekBoard touch taps', () => {
  beforeEach(() => {
    toggleMutate.mockClear();
    saveMutate.mockClear();
  });

  it('a tap with a small finger wiggle still completes the task', () => {
    render(<WeekBoard />);
    touchTap(screen.getByLabelText('Mark done'));
    expect(toggleMutate).toHaveBeenCalledWith({ id: 't1', done: true });
  });

  it('a tap with a small finger wiggle still opens the editor', () => {
    render(<WeekBoard />);
    touchTap(screen.getByText('Buy milk'));
    expect(screen.getByPlaceholderText('Task title')).toBeDefined();
  });
});
