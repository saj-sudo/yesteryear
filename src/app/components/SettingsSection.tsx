import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';

const PHONE = '(max-width: 720px)';

function onPhone(): boolean {
  return typeof matchMedia === 'function' && matchMedia(PHONE).matches;
}

/**
 * One fold of the Settings page. Open on a wide screen. On a phone it
 * starts closed, so the page is a short list of headings, unless
 * `openOnPhone` is set. The choice is made once, when the page opens.
 */
export function SettingsSection({
  title,
  openOnPhone = false,
  children,
}: {
  title: string;
  openOnPhone?: boolean;
  children: ComponentChildren;
}) {
  const [open, setOpen] = useState(() => openOnPhone || !onPhone());
  return (
    <details
      class="settings-section"
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>
        <h2 class="sub">{title}</h2>
      </summary>
      <div class="settings-section-body">{children}</div>
    </details>
  );
}
