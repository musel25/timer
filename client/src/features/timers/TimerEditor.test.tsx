import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { TimerEditor } from './TimerEditor';

describe('TimerEditor', () => {
  it('allows manual focus duration changes without minute preset buttons', () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    client.setQueryData(['timers'], []);
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <TimerEditor />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Focus block' }));

    expect(screen.queryAllByRole('button', { name: /^\d+m$/ })).toHaveLength(0);
    const input = screen.getByRole('spinbutton', { name: 'Focus block' }) as HTMLInputElement;
    expect(input.value).toBe('25');
    fireEvent.keyDown(screen.getByRole('button', { name: 'Increase Focus block' }), { key: 'Enter' });
    expect(input.value).toBe('26');
    fireEvent.keyDown(screen.getByRole('button', { name: 'Decrease Focus block' }), { key: 'Enter' });
    expect(input.value).toBe('25');
    fireEvent.change(input, { target: { value: '37' } });
    fireEvent.blur(input);
    expect(input.value).toBe('37');
  });
});
