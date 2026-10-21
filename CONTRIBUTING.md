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

## Tests

Every engine change needs tests, and every feature must pass against **both** fixture spaces: the field office space (with type and property names unlike any real space) and the minimal space (daily notes only, no setup). Together they check the main promise.

## Conduct

Be kind, assume good faith, and keep reviews about the code.
