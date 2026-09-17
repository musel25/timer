/** Tempo's three beats: a little space for planning, progress, and focus. */
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand${compact ? ' brand-compact' : ''}`}>
      <svg className="brand-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <rect width="40" height="40" rx="12" fill="#6654D9" />
        <path d="M11 23v6M20 16v13M29 10v13" stroke="white" strokeWidth="5" strokeLinecap="round" />
      </svg>
      <span className="brand-wordmark">Tempo<span className="brand-period">.</span></span>
    </span>
  );
}
