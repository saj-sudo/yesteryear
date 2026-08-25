# Contributing to Yesteryear

Thanks for considering it. A few things about this codebase are deliberate and
worth knowing before you open a PR.

> **Disclaimer:** Yesteryear is an independent community tool. It is not
> affiliated with, endorsed by, or sponsored by Capacities. Capacities is a
> trademark of its respective owners.

## Setup

```sh
npm install
npm test         # Vitest, runs entirely against synthetic fixtures
npm run dev      # Vite dev server
npm run build    # tsc --noEmit + production build
```

Node 18+ (the SDK's floor). No OAuth client id is needed for development:
without `VITE_CAPACITIES_CLIENT_ID`, the app runs in demo mode against the
built-in fixture spaces, which is how most of it was built.

## The rules that are treated as build failures

- **No hardcoded schema.** Not one user object-type ID, property ID, or tag
  name may appear in code. The only permitted structure ids are the
  API-defined basics (`RootDailyNote`, `RootTag`, `RootPage`), isolated in
  `src/providers/capacities/constants.ts`. Name→ID resolution happens only in
  `src/engine/resolve.ts`, per run, against what the space actually contains.
- **The engine stays pure.** Nothing under `src/engine/` may import the SDK,
  the DOM, or read the clock — `today` and `rng` are always injected. I/O goes
  through the `Provider`/`StateStore` interfaces in `src/engine/provider.ts`.
- **Fixtures are synthetic, always.** Never commit a real space export, even
  redacted. The stranger's-space fixture is invented fiction; keep it that way.
- **Dependency discipline is a security requirement.** Tokens live in browser
  storage, so any script on the page can reach them. No new runtime
  dependencies without a strong case, no third-party scripts, no CDN loads —
  the CSP guard test (`tests/build/csp.test.ts`) enforces the page-level part.
- **No guilt.** No streaks, counters, "missed", or "overdue" copy anywhere.
  Silence is a valid response and an untouched queue is a normal state.
- **Local dates, never UTC**, for anything user-facing (`src/engine/dates.ts`).
- **State is written whole**, read-before-write, with conflict replay
  (`src/engine/state.ts`). Don't add delta writes.

## Scheduling defaults are load-bearing

The Recall cooldown, `targetRatio: 0.15`, the delayed first review, and the
deliberate `randomShare` come from the spacing literature (Cepeda et al.,
Karpicke & Roediger) and from the documented failure of putting notes on SM-2
schedules. Please don't "improve" them toward a classic flashcard ladder
without bringing evidence to the discussion first.

## Tests

Every engine change needs tests, and every feature must pass against **both**
fixture spaces — the stranger's space (alien schema) and the minimal space
(daily notes only, zero config). That pair is the regression guard for the
whole premise.

## Conduct

Be kind, assume good faith, and keep reviews about the code.
