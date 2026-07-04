export function DiscMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <ellipse
        cx="24"
        cy="24"
        rx="20"
        ry="9"
        transform="rotate(-18 24 24)"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="3"
      />
      <ellipse
        cx="24"
        cy="24"
        rx="11"
        ry="4.5"
        transform="rotate(-18 24 24)"
        stroke="currentColor"
        strokeWidth="2.5"
      />
    </svg>
  );
}
