import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { Timer } from './Timer';

describe('Timer quick start', () => {
  it('allows manual duration changes without minute preset buttons', () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    client.setQueryData(['timers'], []);
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Timer />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.queryAllByRole('button', { name: /^\d+m$/ })).toHaveLength(0);
    const input = screen.getByRole('spinbutton', { name: 'Quick start' }) as HTMLInputElement;
    expect(input.value).toBe('10');
    fireEvent.keyDown(screen.getByRole('button', { name: 'Increase Quick start' }), { key: 'Enter' });
    expect(input.value).toBe('11');
    fireEvent.keyDown(screen.getByRole('button', { name: 'Decrease Quick start' }), { key: 'Enter' });
    expect(input.value).toBe('10');
    fireEvent.change(input, { target: { value: '37' } });
    fireEvent.blur(input);
    expect(input.value).toBe('37');
  });
});
