# Changelog

All notable changes to Yesteryear are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project follows
[semantic versioning](https://semver.org/).

## [0.1.0] — 2026-08-25

Initial release.

### Added

- **Today view** (default): the day's resurfaced mix — the cadence engine's
  output — with a re-drawable *serendipity pairing* alongside: two items
  deliberately drawn from different tags, types, and eras. Pairings are a
  lens: they never touch scheduling state.
- Sampled-pool-first daily allocation: the sampled pool gets at least half
  the slots; rare high-cost date-bound items (birthdays, target dates,
  anniversaries) always land; same-day lookbacks compete for the rest.
- Personal-API-token connect path (advanced, secondary to OAuth) for
  self-hosted builds and early testing.
- Capacities-style design: left sidebar shell, neutral surfaces, blue-violet
  accent, dark mode, mobile collapse.
- Daily-note titles parse in the API's real format (ISO datetime at UTC
  midnight), verified against a live space; hand-titled daily notes skip
  cleanly.

- Static single-page app with no backend: OAuth 2.1 + PKCE entirely in the
  browser, tokens in browser storage, all API calls browser → Capacities.
- **On This Day**: today's date across every past year, one column per year,
  with day navigation. Works on any space with zero configuration.
- **Calendar heatmap**: a year of daily notes at a glance, every written day
  clickable.
- **Queue**: scheduled, recently surfaced, and retired items — editable.
- **Preview**: exactly what a run right now would surface, computed on a
  throwaway state copy.
- **Settings/onboarding** built live from the space's own types, properties,
  and tags; every mapping optional; readable warnings when a name doesn't
  resolve.
- **Temporal producer**: daily-note lookbacks, birthdays, start-date
  anniversaries, target-date marks gated on active statuses.
- **Recall mode**: 45-day cooldown, weighted sampling, deliberate random
  share, keep/dismiss/retire responses parsed forgivingly from the note.
- **Learn mode** (opt-in): ratio-of-time-to-target spacing with contraction,
  delayed first review, revert-to-Recall after the target passes.
- **Block granularity**: resurface individual paragraphs/quotes instead of
  whole pages, with block-level scheduling state.
- Rotation across tag groups, minimal mode, ranking merge with a capped
  Learn share.
- State stored as a `Yesteryear State` page in the user's own space with a
  browser cache, whole-document writes, conflict replay, and JSON
  export/import.
- Demo mode on two synthetic fixture spaces, no account required.
