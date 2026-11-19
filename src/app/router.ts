import { useEffect, useState } from 'preact/hooks';

/**
 * Hash routing inside /app: real paths belong to the MPA entries, views
 * switch on the fragment so no host rewrite rules are ever needed.
 *
 * There are two destinations, Today and Settings. `coming` is Today with
 * the "what is coming" sheet open, so the back button closes the sheet.
 * `learn` is the study sets page, reached from Settings when studying
 * toward a date is turned on.
 */

export type View = 'today' | 'coming' | 'learn' | 'settings';

const ROUTES: Record<string, View> = {
  '#/today': 'today',
  '#/coming': 'coming',
  '#/learn': 'learn',
  '#/settings': 'settings',
  // Links from before the redesign still land somewhere sensible.
  '#/recall': 'coming',
  '#/queue': 'coming',
  '#/on-this-day': 'today',
  '#/preview': 'today',
  '#/heatmap': 'today',
};

export const HASH_FOR: Record<View, string> = {
  today: '#/today',
  coming: '#/coming',
  learn: '#/learn',
  settings: '#/settings',
};

export function currentView(fallback: View): View {
  return ROUTES[location.hash] ?? fallback;
}

export function useView(fallback: View): View {
  const [view, setView] = useState<View>(() => currentView(fallback));
  useEffect(() => {
    const onChange = (): void => setView(currentView(fallback));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, [fallback]);
  return view;
}
