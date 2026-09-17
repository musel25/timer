import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QuickAdd } from './QuickAdd';

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock('../../lib/hooks', () => ({ useSaveTask: () => ({ mutate }) }));

describe('QuickAdd', () => {
  it('submits by button and keeps the draft until saving succeeds', () => {
    render(<QuickAdd date={null} />);
    const input = screen.getByRole('textbox', { name: 'Add task to Inbox' }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '  Plan the weekend  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create inbox task' }));
    expect(mutate).toHaveBeenCalledWith({ title: 'Plan the weekend', date: null }, expect.objectContaining({ onSuccess: expect.any(Function) }));
    expect(input.value).toBe('  Plan the weekend  ');
    act(() => mutate.mock.calls.at(-1)![1].onSuccess());
    expect(input.value).toBe('');
  });
});
