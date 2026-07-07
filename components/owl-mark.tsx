export function OwlMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* two overlapping "owl eye" circles with glowing pupils */}
      <circle cx="17" cy="24" r="12" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="31" cy="24" r="12" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="17" cy="24" r="4" fill="currentColor" />
      <circle cx="31" cy="24" r="4" fill="currentColor" />
      {/* ear tufts */}
      <path d="M8 14 L11 7 L15 13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M40 14 L37 7 L33 13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
