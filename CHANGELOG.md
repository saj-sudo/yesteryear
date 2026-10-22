# Changelog

All notable changes to Yesteryear are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project follows
[semantic versioning](https://semver.org/).

## [Unreleased]

### Added

- **Light, Dark or Auto.** A small switch in the sidebar (at the bottom of the
  page on a phone) lets you pick the theme. Auto still follows the phone or
  computer setting, which is what Yesteryear did before with no way to change
  it. Your choice stays in this browser and is applied before the first
  paint, so the page doesn't flash the other theme. The browser bar colour
  follows it too.
- **Study sets in Learn.** A set has a name, one date and a selection of
  notes: by tag, by object type, or picked one by one with a search that can
  tick many notes at once. The date belongs to the set, so a note no longer
  needs a date property. Moving a set's date moves every note in it and keeps
  their schedule. A note in two sets studies toward the nearer date, then the
  next. When a date passes the notes leave Learn, and giving the set a new
  date brings them back, for an exam you sit more than once. A note taken out
  of a set, or a deleted set, leaves Learn. Changes apply straight away
  instead of at the next daily run.
- Picking many notes at once. In the note picker on a computer, shift-click
  picks a range, dragging a box across rows picks several, the arrow keys move
  between rows (with shift they pick as they go), and Ctrl or Cmd with A picks
  everything shown. On a touch screen, search and "Pick all shown" still work.
- The date-property option moved into a collapsed "Dates from a property"
  section on the Learn page.
- **Add Yesteryear to your home screen.** The site now has a web manifest
  and app icons, so a phone or desktop browser can install it. It opens
  straight to Today in its own window. The CSP allows the manifest
  (`manifest-src 'self'`) and still loads nothing from other origins.
- A link to yesteryear.dev now shows a preview card (title, description and
  a picture of the demo Today page) where it's shared.
- A smoke test in CI opens the built site in Chromium at phone and desktop
  size and fails on any console error or CSP violation.

### Changed


- **New look.** A layout that sits comfortably next to Capacities (white and
  warm off-white surfaces, the system font, soft corners, a familiar
  sidebar) printed in two riso inks, blue and apricot, with their overprint
  for Learn. Today's sources read like Capacities types, the unlikely pair
  is two overlapping prints, and the calendar marks each written day with a
  dot of ink. Dark mode follows the system setting.
- On phone, the nav is now one scrolling row (it used to wrap into a
  clipped grid), and the unlikely pair no longer collapses to empty strips.
- The disclaimer now stays visible in the app: in the sidebar on desktop and
  in a footer on phone. The landing page opens with printed art.
- Without an OAuth client configured, "Try the demo" is the main action on
  the Connect screen.
- All interface text, the demo notes, the README and CONTRIBUTING are
  rewritten in plainer words. The daily-note section separates a title from
  its excerpt with a colon. A test now fails the build if an em or en dash
  comes back.

### Fixed

- Tag chips showed no keyboard focus, because the ring was drawn on a hidden
  checkbox. The chip now shows it.
- Every page under `/app/` logged a CSP violation because zod probes for
  `eval` support. zod now runs in its `jitless` mode, so the probe never
  runs.

## [0.1.0] - 2026-08-25

Initial release.

### Added

- **Today view** (default): the day's resurfaced mix (the cadence engine's
  output) with a re-drawable *serendipity pairing* alongside: two items
  drawn on purpose from different tags, types, and eras. Pairings are a
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
- **Recall and Learn views**, one per cadence: each explains its rhythm with
  the live config numbers, offers inline setup (pick resurfacing tags, turn
  Learn on, assign by tag) when nothing is configured, and shows its slice of
  the schedule (scheduled, recent and retired for Recall; next review and
  target countdowns for Learn), editable in place.
- **Preview**: exactly what a run right now would surface, computed on a
  throwaway state copy.
- **Settings/onboarding** built live from the space's own types, properties,
  and tags; every mapping optional; readable warnings when a name doesn't
  resolve.
- **Temporal producer**: daily-note lookbacks, birthdays, start-date
  anniversaries, target-date marks gated on active statuses.
- **Recall mode**: 45-day cooldown, weighted sampling, a fixed random
  share, keep/dismiss/retire responses parsed loosely from the note.
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
