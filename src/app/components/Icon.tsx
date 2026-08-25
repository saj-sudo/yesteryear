import type { JSX } from 'preact';

/**
 * Tiny inline icon set (16px, stroke = currentColor) so the sidebar can
 * carry glyphs without any external asset — the CSP stays 'self'-only.
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
  settings: (
    <>
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1.6v2M8 12.4v2M1.6 8h2M12.4 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M12.5 3.5l-1.4 1.4M4.9 11.1l-1.4 1.4" />
    </>
  ),
};

export function Icon({ name }: { name: keyof typeof PATHS | string }) {
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
