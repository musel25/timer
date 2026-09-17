import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './Layout';

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/week']}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/desktops" element={<div>desktops page</div>} />
          <Route path="/week" element={<div>week page</div>} />
          <Route path="/timer" element={<div>timer page</div>} />
          <Route path="/habits" element={<div>habits page</div>} />
          <Route path="/notes" element={<div>notes page</div>} />
          <Route path="/stats" element={<div>progress page</div>} />
          <Route path="/settings" element={<div>settings page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('Layout number shortcuts', () => {
  it('jumps to the tab at that position in the sidebar', () => {
    renderApp();
    fireEvent.keyDown(window, { key: '2' });
    expect(screen.getByText('habits page')).toBeDefined();
    fireEvent.keyDown(window, { key: '4' });
    expect(screen.getByText('timer page')).toBeDefined();
    fireEvent.keyDown(window, { key: '3' });
    expect(screen.getByText('desktops page')).toBeDefined();
    fireEvent.keyDown(window, { key: '1' });
    expect(screen.getByText('week page')).toBeDefined();
  });

  it('ignores digits with no tab, modifier chords, and typing in a field', () => {
    renderApp();
    fireEvent.keyDown(window, { key: '9' });
    expect(screen.getByText('week page')).toBeDefined();
    fireEvent.keyDown(window, { key: '3', metaKey: true });
    expect(screen.getByText('week page')).toBeDefined();

    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: '3' });
    expect(screen.getByText('week page')).toBeDefined();
    input.remove();
  });

  it('ignores digits while a full-screen overlay is up', () => {
    renderApp();
    const overlay = document.createElement('div');
    overlay.setAttribute('data-modal', '');
    document.body.appendChild(overlay);
    fireEvent.keyDown(window, { key: '3' });
    expect(screen.getByText('week page')).toBeDefined();
    overlay.remove();
  });
});

describe('mobile navigation', () => {
  it('makes Notes reachable through More and closes after navigation', () => {
    renderApp();
    const more = screen.getByRole('button', { name: 'More' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(more);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    const menu = document.getElementById('mobile-more')!;
    const notes = Array.from(menu.querySelectorAll('a')).find((link) => link.textContent === 'Notes')!;
    fireEvent.click(notes);
    expect(screen.getByText('notes page')).toBeDefined();
    expect(more.getAttribute('aria-expanded')).toBe('false');
  });

  it('dismisses More with Escape or a click outside', () => {
    renderApp();
    const more = screen.getByRole('button', { name: 'More' });
    fireEvent.click(more);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(more);
    fireEvent.click(more);
    fireEvent.pointerDown(document.body);
    expect(more.getAttribute('aria-expanded')).toBe('false');
  });
});
