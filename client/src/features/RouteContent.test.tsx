import { lazy } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { RouteContent } from './RouteContent';

describe('deferred page loading', () => {
  it('keeps navigation available while a page loads', async () => {
    let resolve!: (value: { default: () => JSX.Element }) => void;
    const Page = lazy(() => new Promise<{ default: () => JSX.Element }>((done) => { resolve = done; }));
    render(<MemoryRouter><nav>Navigation</nav><RouteContent><Page /></RouteContent></MemoryRouter>);
    expect(screen.getByText('Navigation')).toBeDefined();
    expect(screen.getByRole('status')).toBeDefined();
    await act(async () => resolve({ default: () => <h1>Notes</h1> }));
    expect(screen.getByRole('heading', { name: 'Notes' })).toBeDefined();
  });
  it('offers recovery on a failed page import and permits navigation away', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Broken(): JSX.Element { throw new Error('Chunk unavailable'); }
    try {
      render(<MemoryRouter><Link to="/week">Week</Link><RouteContent><Routes>
        <Route path="/" element={<Broken />} /><Route path="/week" element={<h1>Weekly plan</h1>} />
      </Routes></RouteContent></MemoryRouter>);
      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByRole('button', { name: 'Reload page' })).toBeDefined();
      fireEvent.click(screen.getByRole('link', { name: 'Week' }));
      expect(screen.getByRole('heading', { name: 'Weekly plan' })).toBeDefined();
    } finally { error.mockRestore(); }
  });
});
