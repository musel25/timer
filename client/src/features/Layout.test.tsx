import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './Layout';

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/week']}>
      <Routes>
        <Route element={<Layout />}>
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
    expect(screen.queryAllByRole('link', { name: /Desktops/ })).toHaveLength(0);
    fireEvent.keyDown(window, { key: '2' });
    expect(screen.getByText('habits page')).toBeDefined();
    fireEvent.keyDown(window, { key: '3' });
    expect(screen.getByText('timer page')).toBeDefined();
    fireEvent.keyDown(window, { key: '4' });
    expect(screen.getByText('progress page')).toBeDefined();
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

describe('desktop navigation', () => {
  it('starts closed and can be opened to reach another page', () => {
    renderApp();
    expect(screen.queryByRole('complementary')).toBeNull();
    const menu = screen.getByRole('button', { name: 'Open navigation' });
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(menu);
    expect(screen.getByRole('complementary')).toBeDefined();
    fireEvent.click(screen.getByRole('complementary').querySelector('a[href="/habits"]')!);
    expect(screen.getByText('habits page')).toBeDefined();
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('moves keyboard focus into the sidebar and restores it on Escape', () => {
    renderApp();
    const menu = screen.getByRole('button', { name: 'Open navigation' });
    menu.focus();
    fireEvent.click(menu);
    const firstLink = screen.getByRole('complementary').querySelector('.sidebar-link');
    expect(document.activeElement).toBe(firstLink);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(document.activeElement).toBe(menu);
  });
});

describe('mobile navigation', () => {
  it('shows Progress in place of Desktops', () => {
    renderApp();
    const nav = screen.getByRole('navigation', { name: 'Mobile navigation' });
    expect(nav.querySelectorAll('a')).toHaveLength(4);
    expect(nav.textContent).toContain('Progress');
    expect(nav.textContent).not.toContain('Desktops');
  });
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

describe('Grind Recall navigation', () => {
  it('links to the separate app from sidebar and mobile More menu', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(screen.getByRole('link', { name: 'Grind Recall' }).getAttribute('href')).toBe('/grind/');
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    const links = screen.getAllByRole('link', { name: 'Grind Recall' });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link.getAttribute('href')).toBe('/grind/');
  });
});
