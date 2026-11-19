import type { JSX } from 'preact';

/**
 * Tiny inline icon set (16px, stroke = currentColor) so the sidebar can
 * carry glyphs without any external asset: the CSP stays 'self'-only.
 */

const PATHS: Record<string, JSX.Element> = {
  today: (
    <>
      <circle cx="8" cy="8" r="3.2" />
      <path d="M8 1.2v1.8M8 13v1.8M1.2 8H3M13 8h1.8M3.2 3.2l1.3 1.3M11.5 11.5l1.3 1.3M12.8 3.2l-1.3 1.3M4.5 11.5l-1.3 1.3" />
    </>
  ),
  onThisDay: (
    <>
      <circle cx="8" cy="8" r="6.3" />
      <path d="M8 4.4V8l2.5 1.6" />
    </>
  ),
  heatmap: (
    <>
      <rect x="1.8" y="1.8" width="5.1" height="5.1" rx="1" />
      <rect x="9.1" y="1.8" width="5.1" height="5.1" rx="1" />
      <rect x="1.8" y="9.1" width="5.1" height="5.1" rx="1" />
      <rect x="9.1" y="9.1" width="5.1" height="5.1" rx="1" />
    </>
  ),
  recall: (
    <>
      <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
      <path d="M13.8 1.8v2.7h-2.7" />
    </>
  ),
  learn: (
    <>
      <circle cx="8" cy="8" r="6.2" />
      <circle cx="8" cy="8" r="3.4" />
      <circle cx="8" cy="8" r="0.8" fill="currentColor" stroke="none" />
    </>
  ),
  preview: (
    <>
      <path d="M1.5 8s2.4-4.4 6.5-4.4S14.5 8 14.5 8 12.1 12.4 8 12.4 1.5 8 1.5 8Z" />
      <circle cx="8" cy="8" r="2" />
    </>
  ),
  // Three sliders. The old gear had rays like Today's sun, and with only
  // two items in the nav the pair read as the same icon twice.
  settings: (
    <>
      <path d="M1.8 4h5.4M10.8 4h3.4M1.8 8h1.6M7 8h7.2M1.8 12h7.4M12.8 12h1.4" />
      <circle cx="9" cy="4" r="1.8" />
      <circle cx="5.2" cy="8" r="1.8" />
      <circle cx="11" cy="12" r="1.8" />
    </>
  ),
};

export function Icon({ name }: { name: string }) {
  const path = PATHS[name];
  if (!path) return null;
  return (
    <svg
      class="icon"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.4"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}
