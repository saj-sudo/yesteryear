# Changelog

All notable changes to Yesteryear are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project follows
[semantic versioning](https://semver.org/).

## [Unreleased]

### Added

- **Recall first.** A setting under Surfaces. When it is on, Today shows a
  Recall or Review note's title and asks what you remember before showing the
  text. One tap shows the note, answer or not, and what you typed sits above
  it. Trying to recall a note helps it stick more than rereading it (Roediger
  and Karpicke 2006). On-this-day, birthday and target-date notes are shown
  straight away. Off by default; nothing you type is saved.

### Fixed

- **The theme switch keeps up.** A choice made in the first moments after
  Settings opened changed the theme and left the switch showing the old
  option. The switch now updates at once.
- **A way out when your space won't load.** If the first load from Capacities
  failed, the app sat on "Reading the space…" with no way to reach Settings
  or Disconnect. It now shows a card with Try again, Reconnect to Capacities
  and Disconnect this browser. The same card appears after 20 seconds if the
  load stalls, and goes away by itself if the load finishes. Refused access
  (a 403 or a missing scope) leads with Reconnect; an outage or a dropped
  network leads with Try again. Reconnecting keeps the old sign-in until the
  new one is saved.

- **Signing in on a phone.** On Android the Capacities consent screen can open
  in a separate tab, and the redirect back landed there without the sign-in
  that was started, so it failed with "does not match". The started sign-in
  now lives in shared browser storage for 15 minutes, a second load of the
  callback no longer wipes it, and the original tab picks up the connection
  when you come back to it.
- **A clearer message when Capacities can't be reached.** A blocked or
  offline token request now says so instead of "Connecting failed".
- **Easier to use on a phone.** All seven views now show in the menu, four
  to a row, instead of a row that scrolled off the side. Text is a little
  larger, and buttons, tags and switches are at least 44px tall. The
  calendar fits the screen, with each month as a column. Recall shows dates
  as "Dec 22, 2026". Row actions in Recall and Learn are proper buttons that
  wrap. Settings opens folded, with the colour theme at the bottom. The
  landing page shows phone screenshots on a phone.
- **The "Resurfaced section was added" notice** shows on Today only, and has
  a Dismiss button.
- **Preview markers** such as keep, dismiss and retire read as small labels
  instead of code.

### Changed

- **The state page says "not yet" too.** The stored names `missedIt` and
  `missedItMultiplier` are now `notYet` and `notYetMultiplier`, so the
  word the no guilt rule bans is gone from the page in your own space. A
  page written by an earlier build still loads, and is rewritten under the
  new names the next time Yesteryear saves. If you keep an old tab open
  after another tab has saved, the old tab treats the newer answer as
  unanswered until it is reloaded.
- **Today opens on a note you can read.** One resurfaced note is set like a
  printed page, with its text at reading size. When the note has a real date
  behind it, its age is the headline ("1 year ago"). The day's other notes
  follow as a short stack with one line of text each. Capacities gives no
  created date for a note, so a note with no date keeps its label as the
  headline.
- **Two destinations: Today and Settings.** On a phone they are one bar at
  the bottom, clear of the home indicator. The two-row menu is gone.
- **The pair has the full width**, in two inks that overprint where the
  sheets cross.
- **The same day in earlier years sits under the pair.** It was the On This
  Day page. The arrows still walk to neighbouring days. Years with nothing
  written are left out.
- **"What is coming" opens from Today as a sheet.** It was the Recall page,
  with the same actions: bring forward, retire, learn this, restore.
- **Studying toward a date is behind a setting**, off until you turn it on
  under Settings. Its page opens from there. The demo starts with it off.
- **Note text is set in Literata**, served from this site under the SIL Open
  Font License. The Content-Security-Policy gains `font-src 'self'`, and the
  CSP test checks that no font or image in the stylesheet comes from
  anywhere else.
- **The "Resurfaced section was added" notice** no longer shows in the demo,
  where the note it names is made up.
- **While the space loads**, a quiet outline of the page shows in place of
  the "Reading the space…" line.
- **One demo button.** The Connect screen shows "Try the demo"; the other
  demos sit under "More demos".
- **A review answers "got it" or "not yet".** The second answer used a word
  that the no guilt rule in CONTRIBUTING bans. Today's review card and the
  Resurfaced section written to the daily note now say "not yet". A daily
  note written by an earlier build still reads back the same way, because
  the old marker counts as "not yet". The state page keeps its field names
  (`missedIt`, `missedItMultiplier`), so nothing stored needs to change.
- **The Calendar is out of the menu.** It shows a dot for every day written,
  which reads as a counter, so the sidebar and the phone menu no longer list
  it. That leaves six views in the menu. The view itself is unchanged and
  still opens at `#/heatmap`.

### Removed

- **Preview is gone.** It repeated Today.
- **The Calendar is gone.** A dot for every day written reads as a counter.
- Old links to `#/preview`, `#/heatmap` and `#/on-this-day` open Today, and
  `#/recall` opens "What is coming".
- **Personal API tokens.** Sign-in is OAuth only, as Capacities asks of public
  integrations. The "Advanced: connect with a personal API token" section is
  gone from the Connect screen and the README. A token saved by an earlier
  build is deleted from browser storage on the next visit, and the visitor sees
  Connect again. Forks need their own OAuth client id in `.env.local`.

### Added

- **Undo.** A response can be taken back. The note keeps its place, shows
  what you chose, and offers undo beside it. A screen reader hears both the
  response and the undo. Undo is still there after a reload, for as long as the
  note is on Today.
- **The demo in one click.** "Try the demo" on the landing page opens the
  demo directly. Opening `/app/` still shows the Connect screen.
- **`npm run shots`** retakes every screenshot and the link preview image
  from the demo space.
- **One-click connect on the hosted site.** Capacities registered the OAuth client
  (`capacities_api_yesteryear`), and the hosted build now ships it in
  `.env.production`. Forks and self-hosted builds set their own id in
  `.env.local`. Without any id, the Connect screen still offers the demo and the
  personal-token path.

- **Setup that reads your space.** Yesteryear used to start with nothing mapped,
  so a space with a Project type or a People type did nothing with them until
  someone found the right dropdowns. It now reads your object types, their
  date and status properties and your tags, and offers what it found in
  Capacities' words, each with what it is used for: "Your projects are
  Project", "Birthdays come from Birthday", "Bring back notes tagged keeper".
  Names it knows start ticked. A guess made from the shape of a type (two dates
  and a status) says so and starts unticked. On the first connect the offer
  comes before the first daily run, so what you pick shapes the first set of
  notes. It also shows at the top of Settings until it is used or skipped, and
  nothing is changed without a tick. Anything already mapped is left alone.
- **Hints in Capacities' words.** A space with no custom types says how to add
  one (Settings → Object Types → + New Type), a type with no date property says
  to open its settings and choose Add property, and an empty tag list says to
  tag a note in Capacities. The README and landing page have a "What you need in
  Capacities" section with the same steps, and the README shows the first
  screen.
- A third demo, "a first run in a new space", shows that first screen.
- **Pick a range of notes on a touch screen.** In the study set note picker,
  "Pick a range" lets you tap the first note and then the last, and everything
  between is picked. Tapping a range that is all picked already takes it back
  out, and notes picked in other searches stay. It works with a mouse and the
  keyboard too. Before, a phone could only tick notes one at a time or pick
  everything shown, because a drag scrolls the list.
- The smoke test now runs axe-core (WCAG 2.2 A and AA plus best practices) on
  the landing page and every demo view, in light and dark, at phone and desktop
  size, and checks the theme switch with the keyboard. A violation fails the
  build.
- **See what is in a study set.** Each set has a "show notes" button that
  lists its notes, with a link to each one in Capacities. It looks up the
  tags and types and adds the notes you picked by hand, the same way the
  daily run does. It only reads: nothing is saved and no schedule changes.
- **Each note in "Learning toward a date" names its set.** The set whose date
  it studies toward comes first, with "+1 more" when another set also holds
  it. Rows gain the label the next time a set is saved or the daily run goes.

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

- **The landing page is easier to scan.** The opening is three short lines
  instead of one dense paragraph, Learn is a list, and paragraphs are three
  sentences at most. The tagline matches the link preview card, and the
  privacy claim links to the test that checks it. A new section covers the
  phone view.
- CONTRIBUTING has a Writing section with the copy rules, which are checked by
  `tests/build/copy.test.ts` where a machine can check them. The README follows
  the same rules: shorter paragraphs, lists for parallel facts, and a section on
  the phone view.
- **The demo spaces read like real notes.** The Fernweh Field Office had about
  400 daily notes made from 12 sentences, so the same line came back every few
  weeks and sometimes twice on one On This Day page. The daily notes now draw
  from a few hundred lines that follow the seasons, in several shapes: short
  bullets, task lists, a morning and an evening, and a paragraph, with the
  odd quote and a link to a person. The space also has 24 field notes instead
  of 8, including meeting notes, a packing list, book notes and a trip debrief.
  The nearly empty space (Kitchen Table Notes) got the same treatment. The
  README screenshots and the link preview card were retaken from the new demo.

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

- **Accessibility pass.** Axe found and this fixes:
  - The theme switch is a proper radio group: Tab lands on the selected option,
    and arrow keys, Home and End move it.
  - Every page has a level-one heading and headings no longer skip levels. A
    note's own headings no longer join the page outline.
  - The calendar is a valid grid with 24px day targets (the dot of ink is the
    same size), and the strip of years on On This Day scrolls with the keyboard.
  - The demo notice is a landmark, and notices sit inside the main area.
  - Links in running text are underlined instead of relying on colour.
  - Soft grey text in dark mode now reaches 4.5:1 on the blue card in the
    unlikely pair.
  - The two buttons under the landing intro no longer crowd each other on a
    phone.
- A note deleted in Capacities stayed in the study sets that listed it, and
  every sync put it back into Learn. It now leaves its sets when the run
  finds it gone, and a row for a deleted note offers "remove".
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
