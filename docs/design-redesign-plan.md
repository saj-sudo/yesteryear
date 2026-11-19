# Design redesign plan: Yesteryear

Written 2026-11-18. This is the plan for Yesteryear's part of a design pass across Saj's builds.
It holds what a review of the running app saw, what is proposed, what would move, and where the
work stands. Update the status section at the end of every sitting.

## Verdict: rethink the structure

The concept is lovely: a forgotten note comes back. The rules are right (no guilt, no counters,
nothing leaves the browser). The limit is structure. Seven views turn one promise into an admin
tool for a schedule, and the working screens hide the one thing the product is about, which is the
words in the note.

## What the review saw

Seen in the demo space on yesteryear.dev and in `docs/*.png`, 2026-11-18.

- **Today shows titles, not notes.** Each card has a title, a pill and two or three buttons. The
  title cannot be opened. The reader is asked to keep, dismiss or retire a note they cannot read.
- **On a phone the note is a long way down.** The two-row icon nav takes about 90px, the demo
  banner 59px and the "Resurfaced section was added" notice 62px. "Resurfaced today" starts at
  about 322px, and the first actual note text (in the pair) is about 1,000px down.
  See `docs/phone-today.png`.
- **The signature is third on the page.** The unlikely pair, two tilted sheets in two inks, is the
  only part of Today that feels like anything, and it sits under the title cards with a secondary
  "Draw another pair" button. See `docs/today.png`.
- **On This Day is the emotional core and it is the fourth tab.** It is the only view that sets
  note text at reading size, in cards by year. See `docs/on-this-day.png`.
- **Seven views for one job.** Recall is a ledger with text links and dates. Preview is a third
  rendering of the same Today list. Calendar is a dot for every day written. Learn is a second
  product (study toward a date) that opens with five sentences on how its scheduling works.
- **The two-ink print look is not on the working screens.** The inks are in the mark, the pair's
  two papers and the dotted demo banner. Everything else is white cards, grey hairlines, pastel
  pills and the system font. No overprint, no grain, no ink limit.
- **Two demo clicks.** "Try the demo" on the landing page leads to a gate with a second
  "Try the demo".

## Fixed first (2026-11-18)

- The Learn response "missed it" broke the rule against that word. It now reads "not yet", on the
  button and in the marker written to the daily note. Notes written before the change still parse.
- The Calendar came out of the navigation, because a dot for every day written reads as a
  counter. The view and its route still work. Whether it is deleted is decided on the mockup.

The screens that still showed the old wording and the old nav were retaken in the build stage.

## Proposal (what the mockup will show)

1. **Today opens on a note.** One resurfaced note, set like a printed page, readable, with its age
   as the headline ("3 years ago"). The other notes for the day follow as a short stack.
   Responses become one quiet row. Likely files: `src/app/views/Today.tsx`,
   `src/app/components/Markdown.tsx`, `src/app/styles.css`.
2. **The pair gets the stage.** Full width under the lead note, with real multiply blending so the
   two inks make a third colour where the sheets cross. Likely files: `src/app/views/Today.tsx`,
   `src/app/styles.css`.
3. **On This Day folds into Today.** The same day in earlier years, under the pair.
   Likely files: `src/app/views/{Today,OnThisDay}.tsx`.
4. **Two destinations.** Today and Settings. Recall becomes a "what is coming" sheet opened from
   Today. On a phone the two-row icon grid goes; what is left fits one bar at the bottom with
   safe-area padding. Likely files: `src/app/App.tsx`, `src/app/router.ts`.
5. **The print identity on the notes themselves.** A two-ink palette with overprint, a face for
   note text that suits a printed page, a little grain. The full typeface Saj chose on 2026-11-18
   lands here: self-hosted, with `font-src 'self'` added to the CSP in the three HTML files and
   `tests/build/csp.test.ts` kept passing. Likely files: `src/app/styles.css`, `index.html`,
   `app/index.html`, `callback/index.html`.
6. **Undo.** A response can be taken back: the card keeps its place and shows what was chosen with
   an undo beside it, announced to screen readers. No timed toast, no count of what is left.
   Undo is a pure engine function with tests against both fixture spaces.

## What would move (each needs Saj's yes on the mockup)

- **Preview:** removed. It repeats Today.
- **Calendar:** removed, or kept only if it can be redrawn so it is not a counter.
- **On This Day:** from its own tab into Today.
- **Recall:** from a tab to a sheet opened from Today.
- **Learn:** Saj's call. It is well built and it is a different promise. The options the mockup
  will show are: behind a setting, or its own product.
- **The "Resurfaced section was added" notice:** not shown in the demo.
- **The landing page's demo link:** straight into the demo, one click.

## Rules this touches

- CONTRIBUTING.md: no streaks, counters, "missed" or "overdue" wording. No hard-coded schema.
  Fixtures always made up, and no real space in a screenshot. Strict CSP. No new runtime
  dependencies. No em or en dashes (`tests/build/dashes.test.ts` covers this file). The copy tests
  on the landing page.
- The "not affiliated with Capacities" line stays visible everywhere.
- Anything still shared with Farview is mirrored there, though the proposal is that the two stop
  sharing a visual language and keep sharing plumbing.

## Measures of success

- Note text inside the first screen on a 390 by 844 phone.
- Two destinations in the navigation.
- The pair above the fold on a desktop.
- The smoke suite stays green: axe with no violations, no CSP violation, no console warning, both
  themes, phone and desktop sizes.

## Finish items to fold into the same build

From the code audit of 2026-11-18: a CSS skeleton for "Reading the space…"; font sizes below the
`--text-xs` token raised to it; `viewport-fit=cover` and safe-area padding; every screenshot and
`public/og.png` retaken from the demo, with a script in the repo so it can be done again.

Open from the fix: the stored names `missedIt` and `missedItMultiplier` are readable in the
person's own state page. Renaming them needs a read-both, write-new migration.

## Stages and status

| Stage | State | Link | Date |
|---|---|---|---|
| Review of the running app | Done | this file | 2026-11-18 |
| Fix first: "not yet", Calendar out of the nav | Merged | pull request 13 | 2026-11-18 |
| Mockup | Published | https://claude.ai/artifact/SUdDFbSwWTmFeLPW9FSN8v | 2026-11-19 |
| Saj picks a direction | Done. See "What Saj picked" below | | 2026-11-19 |
| Build and pull request | Pull request open | pull request 15 | 2026-11-19 |

## What Saj picked (2026-11-19)

- Ink treatment A, the quiet one. Note typeface: Literata.
- Preview and the Calendar removed.
- On This Day folded into Today. Recall as a sheet opened from Today.
- Learn behind a setting, off by default.
- The "Resurfaced section was added" notice hidden in the demo.
- The landing page's demo link goes straight into the demo.

## What the build did, against the measures

- Note text inside the first screen on a 390 by 844 phone: yes, it starts at about 227px.
  Before, the first note text was at 1,494px.
- Two destinations in the navigation: yes, Today and Settings. Before, six.
- The pair above the fold on a 1440 by 900 desktop: yes, it starts at about 545px. It was
  already above the fold before, at 455px, so this one is "kept", not "gained".
- The smoke suite is green, and it now checks the first and third measures on every run.

Calls made in the build that the mockup did not settle:

- Capacities gives no created date for a note. The age headline shows only for a note with a
  real date behind it (a daily note lookback, an anniversary). Other notes use their label.
- The lead note is one that has text to read, preferring one with an age.
- The demo starts with studying toward a date turned off, like every new space.
- Undo lasts for the visit. After a reload the note shows what was chosen, with no undo.
- The colour theme switch lives in Settings at every size.

Still open after the build:

- Renaming the stored names `missedIt` and `missedItMultiplier` (see the finish items).
- Farview: no shared token changed value, so nothing was mirrored. The print look (paper,
  grain, Literata) is Yesteryear's own.

## Starting a session on this build

Paste this into a fresh session that has this repository attached:

> Read `docs/design-redesign-plan.md` and `CONTRIBUTING.md` in this repo. We are doing the next
> open stage in the plan's status table, and only that stage. If the stage is the mockup: run the
> demo space, capture today's screens at 390 by 844 and 1440 by 900, and publish a mockup page that
> shows today's screens beside the proposed ones, with the "what would move" list, then stop for
> my pick. If the stage is the build: build what I picked, keep every rule in CONTRIBUTING.md, check
> the measures of success, open a pull request with before and after screenshots, and update the
> status table.
