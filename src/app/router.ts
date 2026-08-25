import { useEffect, useState } from 'preact/hooks';

/**
 * Hash routing inside /app: real paths belong to the MPA entries, views
 * switch on the fragment so no host rewrite rules are ever needed.
 */

export type View = 'today' | 'onThisDay' | 'heatmap' | 'queue' | 'preview' | 'settings';

const ROUTES: Record<string, View> = {
  '#/today': 'today',
  '#/on-this-day': 'onThisDay',
  '#/heatmap': 'heatmap',
  '#/queue': 'queue',
  '#/preview': 'preview',
  '#/settings': 'settings',
};

export const HASH_FOR: Record<View, string> = {
  today: '#/today',
  onThisDay: '#/on-this-day',
  heatmap: '#/heatmap',
  queue: '#/queue',
  preview: '#/preview',
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
