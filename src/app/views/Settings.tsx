import { useEffect, useMemo, useState } from 'preact/hooks';
import { normalizeConfig } from '../../engine/config';
import { exportDoc, importDoc } from '../../engine/state';
import type { StructureDef, TagDef } from '../../engine/provider';
import { resolveSchema } from '../../engine/resolve';
import type { PropertyRole, TypeRole, YesteryearConfig } from '../../engine/types';
import { isBasicStructure } from '../../providers/capacities/constants';
import type { AppData } from '../App';

/**
 * Settings doubles as onboarding (§6): everything here is built from
 * what the space actually contains, fetched live. Every mapping is
 * opt-in and "none" is always valid — a user who configures nothing
 * still gets daily-note resurfacing.
 */

const BLOCK_TYPES = ['TextBlock', 'QuoteBlock', 'CodeBlock', 'MathBlock'];

export function Settings({ data, onSignOut }: { data: AppData; onSignOut: () => void }) {
  const [structures, setStructures] = useState<StructureDef[] | null>(null);
  const [tags, setTags] = useState<TagDef[] | null>(null);
  const [config, setConfig] = useState<YesteryearConfig>(() =>
    structuredClone(data.manager.current.config),
  );
  const [status, setStatus] = useState<string | null>(null);
  const [importText, setImportText] = useState('');
  const [showTransfer, setShowTransfer] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      data.session.provider.listStructures(),
      data.session.provider.listTags(),
    ]).then(([s, t]) => {
      if (!cancelled) {
        setStructures(s);
        setTags(t);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [data]);

  const warnings = useMemo(
    () => (structures && tags ? resolveSchema(config, structures, tags).warnings : []),
    [config, structures, tags],
  );

  if (!structures || !tags) return <p class="loading">Reading your space’s types and tags…</p>;

  const customTypes = structures.filter((s) => !isBasicStructure(s.id));
  const typeByName = (name: string | undefined): StructureDef | undefined =>
    name
      ? structures.find((s) => s.title.trim().toLowerCase() === name.trim().toLowerCase())
      : undefined;

  const update = (fn: (draft: YesteryearConfig) => void): void => {
    const draft = structuredClone(config);
    fn(draft);
    setConfig(normalizeConfig(draft));
    setStatus(null);
  };

  const save = (): void => {
    const finalConfig = normalizeConfig(structuredClone(config));
    data.manager.mutate((doc) => {
      doc.config = finalConfig;
    });
    data.manager
      .flush()
      .then(() => setStatus('Saved. Settings live in your own space and sync with it.'))
      .catch(() => setStatus('Saving failed — the change is kept locally and will retry.'));
  };

  const typeSelect = (role: TypeRole, label: string, hint: string) => (
    <label class="field">
      <span>{label}</span>
      <select
        value={config.types[role] ?? ''}
        onChange={(e) =>
          update((d) => {
            const v = (e.target as HTMLSelectElement).value;
            if (v) d.types[role] = v;
            else {
              delete d.types[role];
            }
          })
        }
      >
        <option value="">None</option>
        {customTypes.map((s) => (
          <option key={s.id} value={s.title}>
            {s.title}
          </option>
        ))}
      </select>
      <small>{hint}</small>
    </label>
  );

  const propertySelect = (
    role: PropertyRole,
    label: string,
    homeRole: TypeRole,
    propType: 'date' | 'label',
  ) => {
    const home = typeByName(config.types[homeRole]);
    if (!home) return null;
    const options = home.properties.filter((p) => p.type === propType);
    return (
      <label class="field">
        <span>{label}</span>
        <select
          value={config.properties[role] ?? ''}
          onChange={(e) =>
            update((d) => {
              const v = (e.target as HTMLSelectElement).value;
              if (v) d.properties[role] = v;
              else {
                delete d.properties[role];
              }
            })
          }
        >
          <option value="">None</option>
          {options.map((p) => (
            <option key={p.id} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
    );
  };

  const statusProperty = typeByName(config.types.project)?.properties.find(
    (p) => p.name === config.properties.projectStatus,
  );

  const tagToggle = (
    selected: string[],
    toggle: (draft: YesteryearConfig, name: string, on: boolean) => void,
  ) => (
    <div class="tag-grid">
      {tags.length === 0 && <p class="empty-note">This space has no tags yet.</p>}
      {tags.map((tag) => {
        const on = selected.includes(tag.name);
        return (
          <label key={tag.id} class={`tag-chip${on ? ' on' : ''}`}>
            <input
              type="checkbox"
              checked={on}
              onChange={(e) =>
                update((d) => toggle(d, tag.name, (e.target as HTMLInputElement).checked))
              }
            />
            {tag.name}
          </label>
        );
      })}
    </div>
  );

  return (
    <section class="settings">
      <h2>Settings</h2>
      <p class="fineprint">
        Everything below is read from your space — your object types and your
        tags, not anyone else’s. Every mapping is optional; “None” always works.
      </p>

      {warnings.length > 0 && (
        <div class="notice">
          {warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}
      {status && <div class="notice">{status}</div>}

      <h3>Object types</h3>
      {customTypes.length === 0 ? (
        <p class="empty-note">
          No custom types in this space — daily-note resurfacing works without any.
        </p>
      ) : (
        <div class="field-row">
          {typeSelect('project', 'Projects', 'For anniversaries and target dates')}
          {typeSelect('person', 'People', 'For birthdays')}
          {typeSelect('note', 'Notes', 'Your atomic-note type, if you keep one')}
        </div>
      )}

      {config.types.project && (
        <>
          <h3>Project dates</h3>
          <div class="field-row">
            {propertySelect('projectStart', 'Start date', 'project', 'date')}
            {propertySelect('projectTarget', 'Target date', 'project', 'date')}
            {propertySelect('projectStatus', 'Status', 'project', 'label')}
          </div>
          {statusProperty && statusProperty.labelNames.length > 0 && (
            <div class="field">
              <span>Which statuses count as in-flight?</span>
              <div class="tag-grid">
                {statusProperty.labelNames.map((name) => {
                  const on = config.activeStatusValues.includes(name);
                  return (
                    <label key={name} class={`tag-chip${on ? ' on' : ''}`}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) =>
                          update((d) => {
                            const set = new Set(d.activeStatusValues);
                            if ((e.target as HTMLInputElement).checked) set.add(name);
                            else set.delete(name);
                            d.activeStatusValues = [...set];
                          })
                        }
                      />
                      {name}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {config.types.person && (
        <>
          <h3>People</h3>
          <div class="field-row">
            {propertySelect('personBirthday', 'Birthday property', 'person', 'date')}
          </div>
        </>
      )}

      <h3>Resurfacing tags</h3>
      <p class="fineprint">Notes carrying these tags join the Recall rotation.</p>
      {tagToggle(config.recall.tags, (d, name, on) => {
        const set = new Set(d.recall.tags);
        if (on) set.add(name);
        else set.delete(name);
        d.recall.tags = [...set];
      })}

      <h3>Granularity</h3>
      <div class="field-row">
        <label class="field">
          <span>Resurface</span>
          <select
            value={config.granularity.mode}
            onChange={(e) =>
              update((d) => {
                d.granularity.mode =
                  (e.target as HTMLSelectElement).value === 'block' ? 'block' : 'object';
              })
            }
          >
            <option value="object">Whole objects</option>
            <option value="block">Individual blocks</option>
          </select>
          <small>Blocks make long pages resurface one paragraph at a time.</small>
        </label>
        {config.granularity.mode === 'block' && (
          <label class="field">
            <span>Block types</span>
            <div class="tag-grid">
              {BLOCK_TYPES.map((bt) => {
                const on = config.granularity.blockTypes.includes(bt);
                return (
                  <label key={bt} class={`tag-chip${on ? ' on' : ''}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) =>
                        update((d) => {
                          const set = new Set(d.granularity.blockTypes);
                          if ((e.target as HTMLInputElement).checked) set.add(bt);
                          else set.delete(bt);
                          d.granularity.blockTypes = [...set];
                        })
                      }
                    />
                    {bt}
                  </label>
                );
              })}
            </div>
          </label>
        )}
      </div>

      <h3>Rotation</h3>
      <label class="field checkbox">
        <input
          type="checkbox"
          checked={config.rotation.enabled}
          onChange={(e) =>
            update((d) => {
              d.rotation.enabled = (e.target as HTMLInputElement).checked;
            })
          }
        />
        <span>
          Rotate across tag groups, so one busy area cannot own the queue
        </span>
      </label>
      {config.rotation.enabled &&
        tagToggle(config.rotation.groups, (d, name, on) => {
          const set = new Set(d.rotation.groups);
          if (on) set.add(name);
          else set.delete(name);
          d.rotation.groups = [...set];
        })}

      <h3>Learn mode</h3>
      <label class="field checkbox">
        <input
          type="checkbox"
          checked={config.learn.enabled}
          onChange={(e) =>
            update((d) => {
              d.learn.enabled = (e.target as HTMLInputElement).checked;
            })
          }
        />
        <span>
          Space selected notes toward a target date (needs a date property; for
          real memorization tooling, use Anki)
        </span>
      </label>
      {config.learn.enabled && (
        <>
          <p class="fineprint">Notes with these tags enter Learn mode:</p>
          {tagToggle(config.learn.assignByTag, (d, name, on) => {
            const set = new Set(d.learn.assignByTag);
            if (on) set.add(name);
            else set.delete(name);
            d.learn.assignByTag = [...set];
          })}
          <label class="field">
            <span>Target-date property name</span>
            <input
              type="text"
              value={config.learn.targetDateProperty ?? ''}
              placeholder="e.g. the date property on your flashcard type"
              onChange={(e) =>
                update((d) => {
                  const v = (e.target as HTMLInputElement).value.trim();
                  d.learn.targetDateProperty = v || null;
                })
              }
            />
            <small>Items without a resolvable target date stay in Recall.</small>
          </label>
        </>
      )}

      <h3>Surfaces</h3>
      <label class="field checkbox">
        <input
          type="checkbox"
          checked={config.surfaces.dailyNote.enabled}
          onChange={(e) =>
            update((d) => {
              d.surfaces.dailyNote.enabled = (e.target as HTMLInputElement).checked;
            })
          }
        />
        <span>
          Write a “{config.surfaces.dailyNote.heading}” section into the daily
          note on the first visit of the day
        </span>
      </label>
      <div class="field-row">
        <label class="field">
          <span>Items per day</span>
          <input
            type="number"
            min={1}
            max={20}
            value={config.surfaces.dailyNote.maxItems}
            onChange={(e) =>
              update((d) => {
                d.surfaces.dailyNote.maxItems = Number((e.target as HTMLInputElement).value);
              })
            }
          />
        </label>
        <label class="field checkbox">
          <input
            type="checkbox"
            checked={config.minimalMode}
            onChange={(e) =>
              update((d) => {
                d.minimalMode = (e.target as HTMLInputElement).checked;
              })
            }
          />
          <span>Minimal mode: exactly one item a day, preferring “on this day”</span>
        </label>
        <label class="field">
          <span>Timezone</span>
          <input
            type="text"
            value={config.timezone ?? ''}
            placeholder={Intl.DateTimeFormat().resolvedOptions().timeZone}
            onChange={(e) =>
              update((d) => {
                const v = (e.target as HTMLInputElement).value.trim();
                d.timezone = v || null;
              })
            }
          />
          <small>Detected from this browser unless overridden.</small>
        </label>
      </div>

      <div class="settings-actions">
        <button class="primary" onClick={save}>
          Save settings
        </button>
        <button class="subtle" onClick={() => setShowTransfer((s) => !s)}>
          Export / import history
        </button>
        {data.session.kind === 'live' && (
          <button class="subtle" onClick={onSignOut}>
            Disconnect this browser
          </button>
        )}
      </div>
      {data.session.kind === 'live' && (
        <p class="fineprint">
          Disconnecting only clears the tokens in this browser. Your history stays
          in the “Yesteryear State” page in your own space, and you can revoke
          access entirely in Capacities under Settings → Capacities API →
          Connections.
        </p>
      )}

      {showTransfer && (
        <div class="transfer">
          <h3>Your data, portable</h3>
          <p class="fineprint">
            Copy this JSON to keep or move your settings and history. Paste a
            previously exported document below to restore it.
          </p>
          <textarea readOnly rows={8} value={exportDoc(data.manager.current)} />
          <textarea
            rows={4}
            placeholder="Paste an exported document here to import it"
            value={importText}
            onInput={(e) => setImportText((e.target as HTMLTextAreaElement).value)}
          />
          <button
            onClick={() => {
              try {
                const doc = importDoc(importText, new Date().toISOString());
                data.manager.mutate((current) => {
                  current.config = doc.config;
                  current.state = doc.state;
                });
                void data.manager.flush();
                setConfig(structuredClone(doc.config));
                setStatus('Imported. The document replaced settings and history.');
                setImportText('');
              } catch {
                setStatus('That did not parse as an exported Yesteryear document.');
              }
            }}
          >
            Import
          </button>
        </div>
      )}
    </section>
  );
}
