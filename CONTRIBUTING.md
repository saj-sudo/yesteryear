# Contributing to Yesteryear

Thanks for considering it. A few design choices here are worth knowing before you open a PR.

> **Disclaimer:** Yesteryear is an independent community tool. It is not
> affiliated with, endorsed by, or sponsored by Capacities. Capacities is a
> trademark of its respective owners.

## Setup

```sh
npm install
npm run lint     # eslint, warnings fail
npm test         # Vitest, runs entirely against made-up fixtures
npm run dev      # Vite dev server
npm run build    # tsc --noEmit + production build
npm run smoke    # after a build: the built site in Chromium
```

Node 18 or newer (the SDK's minimum). You don't need an OAuth client id for development. Without `VITE_CAPACITIES_CLIENT_ID`, the app runs in demo mode against the built-in fixture spaces, which is how most of it was built.

## Rules that count as build failures

- **No hardcoded schema.** No user object-type ID, property ID or tag name may appear in code. The only structure ids allowed are the ones the API defines (`RootDailyNote`, `RootTag`, `RootPage`), kept in `src/providers/capacities/constants.ts`. Names become IDs only in `src/engine/resolve.ts`, on every run, against what the space contains.
- **The engine stays pure.** Nothing under `src/engine/` may import the SDK or the DOM, or read the clock. `today` and `rng` are always passed in. All I/O goes through the `Provider` and `StateStore` interfaces in `src/engine/provider.ts`.
- **Fixtures are always made up.** Never commit a real space export, even redacted. The demo field office is fiction; keep it that way.
- **Dependencies are a security question.** Tokens live in browser storage, so any script on the page can reach them. No new runtime dependencies without a strong case, no third-party scripts and no CDN loads. The CSP test (`tests/build/csp.test.ts`) checks the page-level part.
- **No guilt.** No streaks, counters, "missed" or "overdue" wording anywhere. Not answering is a valid response, and an untouched queue is a normal state.
- **Local dates, never UTC**, for anything the user sees (`src/engine/dates.ts`).
- **State is written whole**, read before writing, with conflict replay (`src/engine/state.ts`). Don't add partial writes.
- **No em or en dashes.** `tests/build/dashes.test.ts` fails on U+2014 or U+2013 in any tracked text file. Use a full stop, colon, comma or brackets, and "to" for ranges.

## The scheduling defaults matter

The Recall cooldown, `targetRatio: 0.15`, the delayed first review and the fixed `randomShare` come from research on spacing (Cepeda et al., Karpicke & Roediger) and from the known problems with putting notes on SM-2 schedules. Please don't change them toward a classic flashcard ladder without bringing evidence to the discussion first.

## Writing

Words are part of the product, and readers scan. Copy is plain, specific and short. The rules below came from a review of how Capacities, Readwise, Obsidian and Day One write, set against the research on web writing. Those sites use contrast frames, rhythmic triples and dashes freely. We found no evidence that the devices help readers, and the best-known study found that promotional wording hurts usability ([Nielsen and Morkes, 1997](https://www.nngroup.com/topic/writing-web/): concise, scannable and objective copy together scored 124% higher on usability). If better evidence turns up, change the rule and say why here.

**A test checks these** (`tests/build/dashes.test.ts` and `tests/build/copy.test.ts`):

- No em or en dashes, anywhere.
- On the landing page, a paragraph has three sentences at most and a list item two. In the README, both take three. Put parallel items in a list.
- The landing page and the README follow every rule below that a test checks.
- No contrast frames. That means a negation set up only to be knocked down: "not X, it's Y", "X, not Y", "Not X. Y.", "less X, more Y". A plain statement of what something does not do is fine when a reader would otherwise assume it, like "Farview never deletes anything".
- No hype or superlatives: "best", "powerful", "seamless", "#1" and the like.
- No testimonials, user counts or ratings we cannot back.

**A reviewer checks these:**

- No rhythmic triples. Three parallel items used for cadence ("think, learn and create") are out. A real list of things is fine.
- No announced honesty ("honestly", "to be clear", "the truth is").
- No decorative adverbs ("simply", "really", "seamlessly").
- Numbers over adjectives. Say "15% of the time left" in place of "smart spacing".
- A heading states the claim and the first sentence backs it, like "Read-only unless you turn on editing".
- Every trust claim links to something a reader can check: the source, a test, or the consent screen.
- Keep the disclaimer, and never show a real space in a screenshot.

## Tests

Every engine change needs tests, and every feature must pass against **both** fixture spaces: the field office space (with type and property names unlike any real space) and the minimal space (daily notes only, no setup). Together they check the main promise.

One browser check runs in CI: `npm run smoke` serves the built site, opens every page and demo view at phone and desktop size in Chromium, and fails on any console error, uncaught exception or CSP violation. It checks that pages load cleanly and nothing more. Locally it needs a build first, and Chromium from `npx playwright install chromium`.

## Conduct

Be kind, assume good faith, and keep reviews about the code.
