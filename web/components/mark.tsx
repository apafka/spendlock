export function SpendlockMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" fill="none">
      <rect x="4" y="11" width="24" height="17" rx="3" className="fill-pine" />
      <path
        d="M10 11V9a6 6 0 0 1 12 0v2"
        className="stroke-pine"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path d="M9 18.5h14M9 22.5h8" className="stroke-card" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
