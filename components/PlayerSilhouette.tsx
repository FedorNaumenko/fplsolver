// Stand-in for a player with no photo, and for a slot with no player.
//
// Replaces three uppercase initials, which read as a broken image rather than an
// absence. Head-and-shoulders in a faint ink so it reads as "not filled in yet" —
// deliberately low contrast, because it is a placeholder and should not compete with
// the players that do have photos.

export default function PlayerSilhouette({
  className = '',
  tone = 'var(--ink-faint)',
}: {
  className?: string;
  tone?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      preserveAspectRatio="xMidYMax meet"
    >
      {/* Head */}
      <circle cx="24" cy="17" r="9" fill={tone} />
      {/* Shoulders, cropped by the viewBox so it reads as a bust rather than a lollipop */}
      <path d="M24 28 C33.5 28 41 34.5 41 43.5 L41 48 L7 48 L7 43.5 C7 34.5 14.5 28 24 28 Z" fill={tone} />
    </svg>
  );
}
