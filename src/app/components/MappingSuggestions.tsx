import { useState } from 'preact/hooks';
import { pickSuggestion, type Suggestion, type SuggestedType } from '../../engine/suggest';
import type { TypeRole } from '../../engine/types';

/**
 * What Yesteryear found in the space, ready to tick. The words are the ones
 * Capacities uses (object types, properties, tags), and each line says what
 * the thing is used for. A guess says it is a guess and starts unticked.
 */

const quote = (name: string): string => `“${name}”`;

function describe(found: SuggestedType, statuses: string[]): { title: string; detail: string } {
  const p = found.properties;
  if (found.role === 'project') {
    const parts: string[] = [];
    if (p.projectStart) parts.push(`starts from ${quote(p.projectStart)}`);
    if (p.projectTarget) parts.push(`target from ${quote(p.projectTarget)}`);
    if (p.projectStatus) parts.push(`status from ${quote(p.projectStatus)}`);
    const flight = statuses.length > 0 ? ` ${statuses.join(' and ')} count as in flight.` : '';
    return {
      title: found.guess
        ? `${quote(found.type)} might be your projects`
        : `Your projects are ${quote(found.type)}`,
      detail: `Anniversaries and target-date reminders. ${parts.length ? `${capital(parts.join(', '))}.` : ''}${flight}`.trim(),
    };
  }
  if (found.role === 'person') {
    return {
      title: found.guess ? `${quote(found.type)} might be your people` : `Your people are ${quote(found.type)}`,
      detail: `Birthday reminders. Birthdays come from ${quote(p.personBirthday ?? '')}.`,
    };
  }
  return {
    title: `Your notes are ${quote(found.type)}`,
    detail: 'Used as your note type.',
  };
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function MappingSuggestions(props: {
  suggestion: Suggestion;
  spaceTitle: string;
  /** Before the first run, so the choice shapes today's notes. */
  firstRun: boolean;
  onUse: (picked: Suggestion) => void;
  onSkip: () => void;
}) {
  const { suggestion } = props;
  const [roles, setRoles] = useState<Set<TypeRole>>(
    () => new Set(suggestion.types.filter((t) => !t.guess).map((t) => t.role)),
  );
  const [withTags, setWithTags] = useState(true);

  const toggleRole = (role: TypeRole, on: boolean): void => {
    const next = new Set(roles);
    if (on) next.add(role);
    else next.delete(role);
    setRoles(next);
  };

  const anything = roles.size > 0 || (withTags && suggestion.recallTags.length > 0);

  return (
    <section class="setup-card suggestions" aria-labelledby="suggest-title">
      <h2 class="sub" id="suggest-title">
        {props.firstRun ? 'Start with what is in your space' : 'Found in your space'}
      </h2>
      <p>
        Yesteryear read the object types and tags in {quote(props.spaceTitle)}. Tick what looks right and it
        will use them{props.firstRun ? ' from the first run' : ''}. Everything can be changed later in Settings.
      </p>
      <ul class="suggest-list">
        {suggestion.types.map((found) => {
          const text = describe(found, found.role === 'project' ? suggestion.activeStatusValues : []);
          return (
            <li key={found.role}>
              <label>
                <input
                  type="checkbox"
                  checked={roles.has(found.role)}
                  onChange={(e) => toggleRole(found.role, (e.target as HTMLInputElement).checked)}
                />
                <span>
                  <strong>{text.title}</strong>
                  <small>{text.detail}</small>
                </span>
              </label>
            </li>
          );
        })}
        {suggestion.recallTags.length > 0 && (
          <li>
            <label>
              <input
                type="checkbox"
                checked={withTags}
                onChange={(e) => setWithTags((e.target as HTMLInputElement).checked)}
              />
              <span>
                <strong>Bring back notes tagged {suggestion.recallTags.map(quote).join(', ')}</strong>
                <small>These tags join the Recall rotation.</small>
              </span>
            </label>
          </li>
        )}
      </ul>
      <div class="suggest-actions">
        <button class="primary" disabled={!anything} onClick={() => props.onUse(pickSuggestion(suggestion, roles, withTags))}>
          Use these
        </button>
        <button class="subtle" onClick={props.onSkip}>
          {props.firstRun ? 'Skip for now' : 'Not now'}
        </button>
      </div>
    </section>
  );
}
