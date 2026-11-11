import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { App } from './App';

vi.mock('./lib/hooks', () => ({
  useMe: () => ({ data: { user: { id: 'student', email: 'student@test.dev' } }, isLoading: false }),
  useSettings: () => ({ data: undefined }),
  useDesktops: () => ({ data: [] }),
}));
vi.mock('./features/agents/enabled', () => ({ CC_DASH_ENABLED: false }));
vi.mock('./features/tasks/WeekBoard', () => ({ WeekBoard: () => <h1>Week board</h1> }));

afterEach(() => { localStorage.clear(); });

function CurrentPath() {
  const { pathname } = useLocation();
  return <span data-testid="path">{pathname}</span>;
}

it.each(['/desktops', '/now'])('opens Week for old %s links', async (path) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <CurrentPath />
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/week'));
  expect(screen.getByRole('heading', { name: 'Week board' })).toBeDefined();
  client.clear();
});
