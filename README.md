# travelogy-co

B2B travel booking platform — an agent portal and a back-office, bilingual (Arabic-first) with full RTL support.

`CLAUDE.md` is the authoritative project context: architecture, tech stack, phase plan and the decision log (§15). Read it before contributing.

## Status

**Phase 0 (Foundation & tooling) — complete.** No product features yet; Phase 1 designs the database schema and auth.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

The app is locale-prefixed, so start at `/ar` (default) or `/en`. `/ar/ui-kit` is an internal page showing the design tokens and shared primitives in both directions.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Production build |
| `npm run lint` | ESLint, including the Clean Architecture import boundaries |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run format` | Prettier |
| `npm run db:push` | Apply Supabase migrations (Phase 1 onward) |
| `npm run db:types` | Regenerate `src/shared/types/database.ts` from the linked project |

## Architecture

Adapted Clean Architecture; dependencies point inward. See `CLAUDE.md` §6 for the full layout.

```
src/
  app/[locale]/     (public) | (agent) | (admin) route groups
  app/api/          Route Handlers — thin: validate, call a use-case, respond
  modules/<name>/   domain | application | infrastructure | presentation
  shared/           ui | lib | i18n | types | config
  proxy.ts          locale negotiation (+ auth guards from Phase 1)
```

`eslint.config.mjs` enforces the dependency direction: `domain/` cannot import frameworks or other layers, and `application/` must reach infrastructure only through domain ports.

## Conventions

- **No hardcoded UI strings.** Everything goes through `messages/ar.json` and `messages/en.json`, which must stay key-for-key identical.
- **Numbers, currency and dates** go through `src/shared/lib/format.ts`, never hand-built strings.
- **Logical CSS properties** (`ps-`, `me-`, `text-start`, `border-e`) rather than left/right, so layouts mirror automatically under RTL.
- **Design tokens** live in the `@theme` block of `src/app/globals.css`. Prefer semantic tokens (`text-ink-muted`, `bg-surface`) over raw ramp steps.
- **Toasts vs dialogs:** `toast.*` for anything the user needn't acknowledge; `confirmAction()` only before something irreversible.
- **Secrets are never invented.** `src/shared/lib/env.ts` validates the environment and fails loudly with the missing key's name.
