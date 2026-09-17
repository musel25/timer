import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TaskEditor } from './TaskEditor';
import type { Task } from '../../lib/types';

const { save } = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock('../../lib/hooks', () => ({
  useSaveTask: () => ({ mutateAsync: save }),
  useDeleteTask: () => ({ mutateAsync: vi.fn() }),
  useTaskAttachments: () => ({ data: [] }),
  useUploadAttachment: () => ({ mutateAsync: vi.fn() }),
  useDeleteAttachment: () => ({ mutate: vi.fn() }),
}));
const task: Task = {
  id: 'test', title: 'Review the week', notes: null, date: '2026-09-17',
  done: false, completedAt: null, hiddenOn: null, archivedAt: null, sortOrder: 0, createdAt: 0,
};

describe('Task editor keyboard and recovery', () => {
  beforeEach(() => { save.mockReset(); });

  it('closes on Escape and returns focus to the task that opened it', () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const close = vi.fn();
    const { unmount } = render(<TaskEditor task={task} onClose={close} />);
    fireEvent.keyDown(screen.getByPlaceholderText('Task title'), { key: 'Escape' });
    expect(close).toHaveBeenCalledOnce();
    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('keeps keyboard focus within the open dialog', () => {
    render(<TaskEditor task={task} onClose={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: 'Edit task' });
    const buttons = dialog.querySelectorAll<HTMLElement>('button');
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('retains unsaved text and explains a failed save', async () => {
    save.mockRejectedValue(new Error('offline'));
    const close = vi.fn();
    render(<TaskEditor task={task} onClose={close} />);
    const input = screen.getByPlaceholderText('Task title') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Keep this draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Could not save'));
    expect(input.value).toBe('Keep this draft');
    expect(close).not.toHaveBeenCalled();
  });
});
