import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TimerEditor } from './TimerEditor';
import { runSpecFromPreset } from '../../lib/presets';
import type { TimerPreset } from '../../lib/types';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function renderEditor(timer?: TimerPreset) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  client.setQueryData(['timers'], timer ? [timer] : []);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[timer ? `/timers/${timer.id}` : '/timers/new']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/timers/new" element={<TimerEditor />} />
          <Route path="/timers/:id" element={<TimerEditor />} />
          <Route path="/timer" element={<div>Saved timers</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function setDuration(label: string, value: string) {
  const input = screen.getByRole('spinbutton', { name: label });
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

describe('TimerEditor', () => {
  it.each([
    { minutes: '0', seconds: '30', savedWork: 0.5, phaseSeconds: 30 },
    { minutes: '1', seconds: '30', savedWork: 1.5, phaseSeconds: 90 },
  ])('saves and reopens $minutes minutes and $seconds seconds without losing focus time', async ({ minutes, seconds, savedWork, phaseSeconds }) => {
    let saved: TimerPreset | undefined;
    vi.stubGlobal('fetch', async (_url: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        saved = { ...JSON.parse(options.body as string), id: 'seconds-preset', sortOrder: 0, archived: false, createdAt: 1, updatedAt: 1 };
        return Response.json(saved);
      }
      return Response.json(saved ? [saved] : []);
    });
    const view = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Focus block' }));
    setDuration('Focus block', minutes);
    setDuration('Focus block seconds', seconds);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Saved timers');
    expect(saved?.config).toMatchObject({ work: savedWork, short: 5, long: 20, rounds: 4 });
    expect(runSpecFromPreset(saved!).phases?.filter((p) => p.kind === 'work').map((p) => p.seconds)).toEqual([phaseSeconds, phaseSeconds, phaseSeconds, phaseSeconds]);
    view.unmount();
    renderEditor(saved);
    await waitFor(() => expect((screen.getByRole('spinbutton', { name: 'Focus block' }) as HTMLInputElement).value).toBe(minutes));
    expect((screen.getByRole('spinbutton', { name: 'Focus block seconds' }) as HTMLInputElement).value).toBe(seconds);
  });

  it('prevents saving an empty focus duration and accepts one second', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Focus block' }));
    setDuration('Focus block', '0');
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
    setDuration('Focus block seconds', '1');
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(false);
  });

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
