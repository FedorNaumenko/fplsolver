// The app mark: a crowned lion's head in profile.
//
// Hand-built SVG — no icon library, no generated raster. It replaced a crown path
// plus a literal circle. Four earlier attempts were rendered and rejected, which is
// what the shape choices below are reacting to:
//
//   · Profile, not frontal. A frontal mane-and-face collapses into a sun with an
//     emoji face at small sizes; heraldry uses profiles because they survive as
//     silhouettes.
//   · The crown floats clear of the mane. Overlapping them merged both into one
//     unreadable spiky mass.
//   · Blunt muzzle with a chin step. A pointed snout reads as a bird's beak.
//   · The mane wraps under the jaw, so the outline is a maned head rather than a
//     head with spikes stuck on the back.
//
// Two tones only. `gold` and `ground` are parameters because public/icon.svg needs
// literal values — a standalone .svg cannot read CSS custom properties.

/** Profile head: blunt muzzle at the left, mane wrapping the back and under the jaw. */
const HEAD =
  'M14.5 35.5 ' +
  'C12.5 36.5 11 38 11 40 C11 41.8 12 42.8 13.5 43.5 ' +
  'L12.8 46.8 L16.5 47.2 L17.5 50.5 ' +
  'L22 52.5 L23.5 57.5 L29.5 53.5 L33.5 58.5 L37.5 52.8 ' +
  'L43.5 56 L44.5 49.5 L51.5 51 L48.5 44.5 L55 42 L48 38.5 ' +
  'L52 32 L44 33.8 L44 27 L38 30.8 L35.5 25 L31 29.8 ' +
  'L27 23.8 L26 30.5 ' +
  'L20.5 31.5 Z';

export default function CrestIcon({
  className = '',
  gold = 'var(--color-crest)',
  ground = 'var(--color-ground)',
  title,
}: {
  className?: string;
  gold?: string;
  ground?: string;
  title?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {/* Crown — three peaks on a banded base, held clear of the mane. Kept short:
        * a taller crown left the head only ~24px of a 44px mark. */}
      <path d="M18 15 L18 8 L25 14.5 L32 4 L39 14.5 L46 8 L46 15 Z" fill={gold} />
      <rect x="17" y="15.5" width="30" height="4" rx="1.4" fill={gold} />

      {/* Head scaled up about its own centre to use the space the crown gave back.
        * 1.10 rather than more — at 1.18 the mane spikes touch the tile edge. */}
      <g transform="translate(33 41) scale(1.1) translate(-33 -41)">
        <path d={HEAD} fill={gold} />
        {/* Eye, nostril and mouth. Cut in the ground colour rather than masked out —
          * the header backdrop is within a shade of it, so they read as dark detail. */}
        <path d="M18 37.5 L23.5 39 L18 40.8 Z" fill={ground} />
        <path d="M12.6 39.4 L15.4 39 L14.6 41.4 Z" fill={ground} />
        <path d="M14.2 44.6 L18.5 45 L17.6 47 Z" fill={ground} />
      </g>
    </svg>
  );
}
