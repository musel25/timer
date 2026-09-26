import { Component, Suspense, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return (
      <div role="alert" className="space-y-3 p-4">
        <p>This page could not load. Reload to try again.</p>
        <button className="btn-outline" onClick={() => window.location.reload()}>Reload page</button>
      </div>
    );
    return this.props.children;
  }
}

/** Keep navigation and the running timer alive during page downloads. */
export function RouteContent({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <PageBoundary key={pathname}>
      <Suspense fallback={<p role="status" className="p-4 text-sm text-slate-400">Loading page…</p>}>
        {children}
      </Suspense>
    </PageBoundary>
  );
}
