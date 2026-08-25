import { useEffect, useState } from 'preact/hooks';
import { previewDaily } from '../../engine/orchestrate';
import type { SurfacedItem } from '../../engine/types';
import type { AppData } from '../App';
import { Markdown } from '../components/Markdown';

/**
 * Preview (§9.1): exactly what the next daily-note write would contain,
 * computed on a throwaway copy of state — nothing is written anywhere.
 * This is the onboarding payoff: real content from the user's own space
 * before anything touches their notes.
 */
export function Preview({ data }: { data: AppData }) {
  const [result, setResult] = useState<{
    surfaced: SurfacedItem[];
    markdown: string | null;
    warnings: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    previewDaily({
      provider: data.session.provider,
      manager: data.manager,
      today: data.today,
      rng: Math.random,
      notesByDate: data.notes,
    })
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch(() => {
        if (!cancelled) setError('The preview could not be computed right now.');
      });
    return () => {
      cancelled = true;
    };
  }, [data]);

  if (error) return <p class="notice">{error}</p>;
  if (!result) return <p class="loading">Computing what today would surface…</p>;

  return (
    <section class="preview">
      <h2>Preview</h2>
      <p class="fineprint">
        What a run right now would surface. Nothing has been written — this view
        never touches your notes.
      </p>
      {result.warnings.length > 0 && (
        <div class="notice">
          {result.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}
      {result.markdown ? (
        <div class="preview-card">
          <Markdown text={result.markdown} />
        </div>
      ) : (
        <p class="empty-note">
          Nothing would surface today — a quiet day is a normal day.
        </p>
      )}
    </section>
  );
}
