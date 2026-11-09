/** SubShelf mark: three shelves of a list, the nearest charge in signal red. */
export function LogoGlyph({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="5" y="7" width="22" height="4.5" rx="2.25" fill="currentColor" />
      <rect x="5" y="14" width="16" height="4.5" rx="2.25" fill="currentColor" opacity="0.55" />
      <rect x="5" y="21" width="9.5" height="4.5" rx="2.25" fill="#ff3616" />
    </svg>
  )
}
