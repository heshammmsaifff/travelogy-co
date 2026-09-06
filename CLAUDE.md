# Last Line Travel — B2B Travel Booking Platform

This file is the persistent project context for Claude Code. Read it in full before writing any code, and re-read the relevant phase section before starting that phase. Do not skip ahead to a later phase before the current one is finished and verified.

## 1. What we're building

A B2B travel booking platform: a company ("the Client") sells travel services (starting with hotels, later transfers, packages, etc.) to travel agents, sub-agents, and corporate partners through two connected systems:

- **Agent Portal (B2B)** — where registered agents log in, search inventory, book on behalf of their own customers, manage quotations, view their booking history, track their credit balance, and download vouchers/invoices.
- **Back-Office (Admin)** — where the Client's staff manage agents, inventory, rates, bookings, finance, content, and reporting.

The functional scope below was distilled from a vendor proposal we received for this project (Technoheaven / "Travel Booking Engine"), used only as a **requirements reference** — a description of the business capabilities a B2B travel platform of this kind needs. This is an independent, original implementation: we are not using, adapting, or referencing that vendor's source code, UI, database design, or any proprietary material — only the general, industry-standard business functionality described (agent portals, back-office travel management, hotel contracting, etc., which are common patterns across the whole B2B travel industry, not proprietary to any one vendor). Build everything from scratch, in our own architecture, named and structured however this document specifies.

**Scope philosophy (explicitly decided by the client of this project):** build *everything* described below, but in phases. Hotels, transfers, packages, CRM, driver operations and external supplier API integrations are all in scope — they are simply sequenced so the foundation and the Hotel module (the first real product) are solid before anything else is added. Do not silently drop a later-phase module; it is deferred, not removed.

**The one deliberate exclusion: payment gateways.** The client has since decided there will be no online payment processing in this platform, in any phase (§10). That is *removed*, not deferred — do not re-add gateway scaffolding on the assumption it will be wanted later.

## 2. Guiding principles

1. **Clean Architecture, adapted to Next.js.** Business logic must never live inside a page/route file. See §6 for the exact folder layout and dependency direction.
2. **Performance and resource efficiency are first-class requirements**, not an afterthought — this app must run well on modest Supabase/hosting tiers. See §11.
3. **No placeholder/fake functionality presented as done.** If something is stubbed for a later phase, it must be visibly and honestly stubbed (e.g., a disabled button with "coming soon"), never a fake success message.
4. **Bilingual and RTL from day one**, not bolted on later. Every screen built in every phase must work in both Arabic and English.
5. **One phase at a time.** After finishing a phase, stop, summarize what was built, run lint/build/type-check, and wait for confirmation before starting the next phase.
6. **Never invent secrets.** If an environment variable is missing, stop and ask for it — never hardcode a fake key or silently disable the feature that needs it.

## 3. Tech stack

- **Framework:** Next.js (App Router, latest stable), TypeScript in strict mode.
- **Styling:** Tailwind CSS.
- **Backend/DB/Auth/Storage:** Supabase (Postgres, Auth, Storage only for anything not sent to Cloudinary, Realtime where useful, Row Level Security everywhere).
- **API layer:** Next.js Route Handlers + Server Actions (no separate Express/Nest backend).
- **Icons:** react-icons.
- **Toasts (non-blocking feedback):** `sileo` — https://github.com/hiaaryan/sileo / https://sileo.aaryan.design/. Install with `npm install sileo`. Mount a single `<Toaster />` once in the root layout; call `sileo.success()`, `sileo.error()`, `sileo.warning()`, `sileo.info()`, and the promise-based toast for async actions (e.g. booking creation). Use it for: "saved successfully", "booking confirmed", background action results — anything that shouldn't interrupt the user.
- **Blocking confirmations / alerts:** `sweetalert2`. Use it only for things that need explicit user confirmation before an irreversible or important action (delete a hotel, cancel a booking, suspend an agent) or for a modal-style success/error that must be acknowledged.
- **Forms & validation:** React Hook Form + Zod (shared Zod schemas between client-side form validation and server-side input validation — define once per module, reuse both places).
- **Media:** Cloudinary (see §10).
- **i18n:** `next-intl`, locales `ar` (default) and `en`, full RTL support for Arabic.
- **Design:** follow the design methodology from https://github.com/nextlevelbuilder/ui-ux-pro-max-skill for layout, spacing, component quality, and overall visual polish — simple, professional, not generic-looking AI output. Build a small internal design-token set (colors, spacing, radii, typography) once in Phase 0 and reuse it everywhere; don't restyle ad hoc per page.
- **Data fetching:** prefer React Server Components + Server Actions for anything that doesn't need client interactivity. Where client-side caching/refetching is genuinely needed (live dashboards, interactive agent search), use TanStack Query. Avoid client-side global state libraries unless a real cross-page state need appears — don't add Redux/Zustand speculatively.
- **PDF generation** (vouchers, invoices): decide a lightweight library in Phase 5 (e.g. `@react-pdf/renderer` or server-side HTML-to-PDF) — evaluate bundle/server cost, pick the cheaper one to run.
- **Testing:** basic unit tests for domain/application logic (Vitest) and at least critical-path e2e coverage (Playwright — already available in typical environments) added in Phase 10; don't skip this to "save time."

## 4. Environment variables

Create `.env.local` (git-ignored) from this template. **Never commit real values. Never fabricate a value if one is missing — ask instead.**

```env
# --- Supabase ---
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=   # Supabase's current name for the old anon key (sb_publishable_...)
SUPABASE_SERVICE_ROLE_KEY=          # server-only, never exposed to the client

# --- Cloudinary ---
# Fill these in before Phase 0 finishes (needed for the upload/compression pipeline in Phase 3).
CLOUDINARY_CLOUD_NAME=            # real value lives in .env.local only
CLOUDINARY_API_KEY=               # real value lives in .env.local only
CLOUDINARY_API_SECRET=            # real value lives in .env.local only

# --- App ---
NEXT_PUBLIC_SITE_URL=                # e.g. http://localhost:3000 in dev

# --- Deliberately NOT here ------------------------------------------------
# Payment gateway keys: there is no payment gateway in this platform, in any
#   phase. See §10.
# External supplier keys (RateHawk, Hotelbeds, ...): entered by the super_admin
#   from the back-office and stored encrypted in Supabase Vault, never as
#   environment variables. See §9.
```

Also commit a `.env.example` with the same keys but empty, so the repo documents what it needs without leaking anything.

**Cloudinary uploads must be signed, server-side.** Never expose `CLOUDINARY_API_SECRET` to the browser. Flow: client asks a Route Handler for a signed upload signature → client uploads directly to Cloudinary with that signature → Cloudinary URL is saved to Supabase.

### Supabase CLI & migrations workflow (how schema changes get made)

Claude Code does **not** have standing direct access to modify the Supabase project by itself — that access is granted explicitly, once, by a human on their own machine, via the Supabase CLI. This keeps every schema change reviewable and versioned instead of being a silent live edit.

**One-time setup (done by a human, not by Claude Code, before Phase 1 starts):**
1. `npm install -D supabase` in the project.
2. `npx supabase login` — opens a browser, authenticates, and stores a token in the local machine's CLI config. This is per-machine, not per-repo, and nothing from it goes into `.env.local` or gets committed.
3. `npx supabase link --project-ref <your-project-ref>` — links this repo to the actual Supabase project (the ref is visible in the Supabase dashboard URL / Settings → General; it's an identifier, not a secret, and is fine to have in the repo's `supabase/config.toml`).

**From Phase 1 onward, Claude Code's workflow for any schema change is:**
1. Write a new file under `supabase/migrations/<timestamp>_<description>.sql` — never edit a migration that has already been applied; a further change is always a new migration file.
2. Run `npx supabase db push` to apply it to the linked project, then regenerate types (`npx supabase gen types typescript --linked > src/shared/types/database.ts` or equivalent) so the app stays in sync with the schema.
3. Never run a destructive statement (`DROP TABLE`, a column drop that loses data, etc.) without calling it out explicitly first and getting confirmation — a migration file makes the change reviewable before it's pushed, so use that review moment.

If `supabase login`/`supabase link` hasn't been done yet when Phase 1 starts, stop and ask for it — that one-time step needs a human in a browser and shouldn't be worked around.

(Non-interactive CLI auth via `SUPABASE_ACCESS_TOKEN` is only needed later if a CI pipeline is added in Phase 10 — not for local development now.)

## 5. Internationalization & RTL

- `next-intl` with `ar` and `en`; `ar` is the default locale, `en` is secondary — routes are locale-prefixed (`/ar/...`, `/en/...`).
- All UI copy lives in `messages/ar.json` and `messages/en.json` per module (or namespaced) — no hardcoded UI strings in components.
- The `<html dir>` attribute must switch between `rtl` (Arabic) and `ltr` (English) at the root layout level. Every layout/component must be built and tested in both directions — don't assume LTR and patch RTL later.
- Numbers, currency, and dates must be locale-formatted (`Intl.NumberFormat` / `Intl.DateTimeFormat`), not hand-formatted strings.

## 6. Architecture — folder structure

Adapted Clean Architecture: dependencies point inward (presentation/infrastructure depend on application, application depends on domain; domain depends on nothing).

```
src/
  app/
    [locale]/
      (public)/            # marketing site: home, about, privacy, terms — SSR/SSG
      (agent)/              # authenticated agent portal
      (admin)/              # authenticated back-office
    api/                    # Route Handlers (thin: parse input, call application layer, return response)
  modules/
    auth/
    agencies/               # agent/company accounts, credit limits, sub-users
    hotels/                 # Phase 3 — see §12 for the supplier-provider pattern
    bookings/
    finance/                # statements, invoices, promo codes, VAT
    cms/                    # banners, static page content
    reports/
    transfers/              # later phase
    packages/               # later phase
    crm/                    # later phase
    driver-ops/             # later phase
    <each module>/
      domain/               # entities, value objects, domain errors, repository interfaces ("ports") — no framework imports
      application/          # use-cases/services, Zod schemas, DTOs — orchestrates domain + ports, no direct Supabase/Next imports
      infrastructure/       # Supabase repository implementations of the ports, external API adapters, Cloudinary/PDF/email adapters
      presentation/         # React components, hooks, client state scoped to this module
  shared/
    ui/                     # design-system components (buttons, inputs, tables, modals, layout primitives)
    lib/                    # supabase client/server factories, cloudinary helper, image-compression helper, logger
    i18n/
    types/
  proxy.ts                  # locale negotiation + auth/role route guards
                            # (Next.js 16 renamed middleware.ts -> proxy.ts; see §15)
messages/
  ar.json
  en.json
```

Rule of thumb: a Route Handler or Server Action should be a few lines — validate input with the module's Zod schema, call one application use-case, map the result to a response. If a route file is doing real logic, that logic belongs in `application/`.

## 7. Roles, permissions & access model

Access control is **dynamic**. The `super_admin` creates roles and decides exactly what each one may do, from the back-office. A role is a row in the database, not a hardcoded string in the code.

### System roles (protected)

These four always exist. They cannot be deleted or renamed, and that is enforced by a database constraint, not merely hidden in the UI:

- `super_admin` — implicitly holds **every** permission, including permission management itself. Never evaluated against the permission table; it short-circuits to "allowed" (see the lockout rule below).
- `staff` — the baseline back-office role. Its permission set *is* editable.
- `agent_owner` — the primary user of a registered agent company; manages that company's profile and sub-users.
- `agent_user` — a sub-user under an agent company, scoped by the `agent_owner`.

### Custom roles

The `super_admin` can create any number of additional **back-office** roles — "Reservations Officer", "Accountant", "Content Editor" — and tick exactly which permissions each one holds.

Agent-side permissions remain with the `agent_owner`, who assigns them to sub-users inside their own company. Roles carry a `scope` column (`admin` | `agent`) from the first migration, so client-defined agent roles can be introduced later without reshaping the schema — but only `admin`-scoped custom roles are built in Phase 2.

### Permissions

A permission is a **named key, grouped by module** — not a CRUD flag — so that non-CRUD actions can be expressed honestly rather than forced into "edit":

```
hotels.view              hotels.create             hotels.rates.update
agencies.approve         agencies.suspend          agencies.credit_limit.update
bookings.view_all        bookings.cancel           bookings.confirm
finance.payments.record  finance.statements.view   reports.export
settings.roles.manage    settings.suppliers.manage cms.content.publish
```

The permission list is a **registry seeded by migration**, extended whenever a module adds a new action. It is never invented at runtime from user input — a role can only be granted permissions that already exist in the registry. The role-management screen renders the registry grouped by module.

### Enforcement rules

1. **RLS must never hardcode a role name.** With dynamic roles, `role = 'staff'` inside a policy becomes wrong the moment someone creates a fifth role. Policies call a `SECURITY DEFINER` function instead — `has_permission(auth.uid(), 'hotels.create')` — which resolves caller → role → permissions.
2. **Re-check server-side too.** Every mutating use-case re-checks the permission in the application layer as well (§12). RLS is the floor, not the only gate.
3. **Lockout protection.** `super_admin` cannot be deleted, cannot have permissions stripped, and the *last remaining* active `super_admin` cannot be demoted, suspended or deleted. Enforce with a database trigger, not just a UI guard — an access-control system that can lock its owner out is a defect.
4. **Permission changes are audited.** Record who changed which role's permissions and when. A permission system with no audit trail cannot be reviewed after an incident.
5. **Granting a permission you do not hold is forbidden**, except for `super_admin`. Otherwise any role with `settings.roles.manage` could quietly escalate itself to full access.

## 8. Media handling (Cloudinary + compression)

Pipeline for every image upload (hotel photos, banners, documents where relevant):

1. Client-side: compress the image and convert to WebP before upload, using a JS compression library (e.g. `browser-image-compression`) — reduce file size/resolution to sane bounds for the use case (e.g. max ~1600px on the long edge for hotel photos) before it ever leaves the browser.
2. Upload to Cloudinary via a signed, server-issued signature (see §4).
3. Store the returned Cloudinary URL/public_id in Supabase, not the binary.
4. When rendering, use Cloudinary transformation URLs (`f_auto,q_auto`) so Cloudinary also serves the optimal format/quality per browser — the client-side compression and Cloudinary's own optimization are complementary, not redundant (client-side saves upload bandwidth and Cloudinary storage; `f_auto,q_auto` saves delivery bandwidth).

## 9. Hotel supplier abstraction (internal + external, both supported)

The client wants both an internally-managed inventory (admin enters hotels/rooms/rates by hand) and the ability to plug in real external hotel suppliers later — without rewriting the booking/search flow. Model this with a port/adapter pattern from the start:

- `modules/hotels/domain/ports/hotel-supplier.port.ts` — an interface with methods like `searchAvailability`, `getRatePlans`, `createBooking`, `cancelBooking`, returning a common internal domain shape regardless of provider.
- `modules/hotels/infrastructure/providers/internal-inventory.provider.ts` — implements the port using our own Supabase-managed hotels/rooms/rates/allocation tables. This is the only active provider in Phase 3.
- `modules/hotels/infrastructure/providers/external/*.provider.ts` — one adapter per external supplier (e.g. RateHawk, Hotelbeds), added in Phase 3b/Phase 9 once the super_admin has entered credentials, each mapping that supplier's API responses into the same common shape.
- A small aggregator/registry merges results from whichever providers are enabled, so the search/booking UI never needs to know which provider a result came from.

Do not build the external adapters against real credentials until they're provided — build the port and the internal provider first (Phase 3a), and the adapter interface + one stubbed/sandboxed external example (Phase 3b) so the seam exists and is proven, without blocking on a vendor contract.

### Supplier credentials — entered by the super_admin, stored encrypted

External supplier API keys are **not** environment variables. The `super_admin` enters, tests and rotates them from the back-office, and they are stored encrypted in the database:

- Secret values live in **Supabase Vault**, so the encryption key is managed by Supabase itself and never appears in the repo, in `.env.local`, or anywhere in application code. No new master-key environment variable is introduced.
- A `supplier_integrations` table holds only the **non-secret** configuration per supplier: provider key, display name, enabled flag, environment (`sandbox` | `production`), timestamps, who last updated it, and a reference to the Vault secret. It never holds the secret value itself.
- Secrets are read **only** server-side, through the service-role client, from inside the provider adapter. They are never sent to the browser, never returned by a Route Handler, and never written to a log or an error message.
- The back-office UI shows only *whether* a credential is set and when it was last changed — never the value, not even masked-with-reveal. Rotating means typing a new value, not reading the old one.
- Reading, writing or connection-testing a supplier credential requires the `settings.suppliers.manage` permission (§7), and every change is audited.

Why this rather than environment variables: the keys belong to the business, not to a deployment. In the database, the client can rotate a leaked key immediately without a redeploy, can switch a supplier between sandbox and production from inside the product, and can onboard a new supplier without an ops change on every environment.

## 10. Payments — credit account only, no payment gateways

**There is no payment gateway integration in this platform, in any phase.** This is a settled product decision, not a deferral: no card processing, no online checkout, no gateway webhooks, no stored card data. Agents transact against a credit account the admin controls.

- Each agent company has a credit limit and a running balance, visible to the agent and enforced at booking time (block or warn when a booking would exceed the limit — decide and document the exact rule in Phase 2).
- The admin reconciles payments manually (bank transfer, cheque, cash) and records them against the agent's statement of account (Phase 5's finance module).
- A `payments` table remains central — it is the audit trail behind every balance movement. Each row records method, amount, currency, reference, the admin who recorded it, and the agent it applies to. Recording a payment requires the `finance.payments.record` permission (§7).
- **Never mutate an agent's balance without a corresponding `payments` row.** The balance is derived from the ledger; it is not a number someone types in. That is what makes the statement of account reconcilable.

## 11. Performance & resource efficiency rules

- Prefer Server Components; only mark a component `"use client"` when it truly needs interactivity/state.
- Select only the columns you need from Supabase — no `select('*')` in hot paths.
- Paginate every list (bookings, agents, hotels, reports) — never load an unbounded table.
- Push filtering/sorting/aggregation into Postgres (views or RPC functions) instead of pulling rows into JS to filter.
- Use Next.js caching (`fetch` cache options, `revalidateTag`/`revalidatePath`) for content that doesn't change per-request (static pages, CMS content, rarely-changing rate data).
- Keep an eye on Supabase connection usage — use the pooled connection string, and avoid opening a new client per request where a shared server-side client suffices.
- Bundle discipline: check bundle size impact before adding a new client-side dependency; prefer smaller/no-dependency solutions where reasonable.

## 12. Security rules

- RLS enabled and tested on every table, no exceptions "for now."
- All input validated server-side with Zod, even if also validated client-side.
- Rate-limit sensitive Route Handlers (login, registration, booking creation) — a simple Supabase-backed or edge rate limiter is enough at this stage.
- Never trust a role/permission claim from the client — re-check it server-side in the use-case layer for every mutating action.
- Passwords/auth handled entirely by Supabase Auth — do not build custom password storage.
- Third-party credentials entered through the product (supplier API keys, §9) go in Supabase Vault — never a plaintext column, never an environment variable, never returned to the browser.
- Never log a decrypted secret, and never put one in an error message or exception that could reach a client or an error-reporting service.
- RLS policies resolve access through `has_permission()` rather than comparing role names, so a newly created role is governed correctly without touching every policy (§7).

## 13. Implementation phases

Work through these strictly in order. Each phase ends with: lint passes, `tsc` has no errors, the app builds, the feature works in both `ar` and `en`/RTL and LTR, and a short written summary of what was built and any decisions made. Wait for confirmation before starting the next phase.

**Phase 0 — Foundation & tooling**
Next.js + TypeScript (strict) + Tailwind setup; ESLint/Prettier; the `modules/` + `shared/` skeleton from §6; Supabase project wiring (client/server helpers); `next-intl` wired with `ar`/`en` and RTL/LTR switching working on a blank page; base design tokens and a handful of shared UI primitives (button, input, card, modal, table shell) per the referenced design skill; `sileo` Toaster mounted; `sweetalert2` wired with one working example; react-icons in use; Cloudinary signed-upload Route Handler skeleton (no real feature yet, just the plumbing proven end-to-end with a test upload).

**Phase 1 — Database design & auth foundation**
Design and migrate the core schema: users/profiles, roles/permissions, agencies (agent companies) and their sub-users, sessions/auth flow via Supabase Auth (registration request → pending admin approval → active), password reset. RLS policies for everything created so far. Auth-aware `src/proxy.ts` route guarding for `(agent)` and `(admin)` route groups.

**Phase 2 — Back-office core & access control**
Role & permission management (§7): the seeded permission registry, the role builder — create/edit custom back-office roles and tick their permissions — the `has_permission()` function that RLS policies call, the lockout-protection trigger, and the permission-change audit trail. Admin & staff management (create staff, assign a role). Agent management: view/approve/reject registration requests, set credit limits, edit agent profile, suspend/reactivate agents.

**Phase 3 — Hotel module (first real product)**
3a: Internal inventory management — hotel/property CRUD, room types, meal plans, occupancy rules, rate master (date-ranged contract rates), cancellation policies, offers, image management via the Cloudinary pipeline (§10), allocation/inventory counts.
3b: Supplier abstraction — the port + internal provider wired through it (§9), plus the adapter interface proven with one external example. Also the back-office **supplier credentials** screen: the `super_admin` enters, rotates and connection-tests supplier API keys, stored in Supabase Vault behind the `settings.suppliers.manage` permission (§9).
3c: Search & availability — the agent-facing search flow querying whichever providers are active, with markup/pricing rules applied.

**Phase 4 — Agent portal & public site**
Bilingual public marketing pages (home, about, privacy policy, terms) with banners. Agent registration flow, login, dashboard shell. Hotel search → booking flow, saved quotations, booking history, credit balance visibility, company profile management for the agent.

**Phase 5 — Booking engine, vouchers, invoices & finance**
Booking state machine (pending/confirmed/cancelled/completed), voucher and invoice PDF generation, per-agent statement of account, admin finance dashboard (manual payment recording against the `payments` ledger, receivables/payables view), promo codes, VAT/tax configuration, currency/exchange-rate data model (even if only one operating currency is exposed in the UI initially — build the model so adding a second currency later doesn't require a redesign).

**Phase 6 — CMS**
Admin-editable homepage banners and static page content (About/Privacy/Terms), offers/promotions content — no-code content updates for the admin.

**Phase 7 — Reports & analytics**
Booking reports, agent performance/profitability reports, hotel reports, exportable to CSV/Excel.

**Phase 8 — Additional product modules (same pattern as the hotel module)**
Transfers module, Packages/Tours module, CRM module, Driver operations (start as a responsive web view before considering a native app) — each following the same domain/application/infrastructure/presentation split and the same supplier-provider pattern where relevant.

**Phase 9 — External supplier expansion**
Add further external hotel/activity/transfer suppliers and, if still wanted, a flight API (e.g. Amadeus) using the adapter pattern from §9 — only once credentials are available.

**Phase 10 — Hardening, testing & launch**
RLS audit, rate-limiting review, caching/query performance pass, image pipeline audit, Lighthouse + accessibility pass, error monitoring, unit tests for domain/application logic, Playwright coverage of critical paths (registration, login, search, booking, admin approval), production Supabase project, Vercel deployment, custom domain, SEO basics, and a short admin/agent user guide.

## 14. Working agreement for Claude Code

- Confirm you've read this whole file before writing code in a fresh session.
- One phase at a time, in order — don't jump ahead even if it looks quick.
- If a phase needs a decision this file doesn't cover, ask rather than guessing silently, then record the decision back into this file so it isn't re-litigated next session.
- If an environment variable needed for the current phase is empty, stop and ask for it.
- All Supabase schema changes go through a migration file + `supabase db push` as described in §4 — never a manual edit made straight in the Supabase dashboard/SQL editor that isn't also captured as a migration in the repo.
- Commit logically (e.g. one commit per phase or per meaningful sub-step) with clear messages.
- Prefer readable, well-named, commented-where-non-obvious code over cleverness.

## 15. Decision log

Decisions taken during implementation that this file did not already cover.
Recorded here so they aren't re-litigated in a later session (§14).

### Phase 0 (foundation) — decided 2026-09-06

| # | Decision | Rationale |
|---|---|---|
| 0.1 | **Starter template removed.** The repo arrived carrying `create-next-app -e with-supabase` (demo auth pages, tutorial and hero components, root-level `app/ components/ lib/`). All of it was deleted and rebuilt under the `src/` layout in §6. | The demo auth screens would have been thrown away in Phase 1 regardless, and the root-level layout contradicted §6. The Supabase SSR cookie helpers were the one piece worth keeping, and were rewritten into `src/shared/lib/supabase/`. |
| 0.2 | **Tailwind CSS 4** (upgraded from the starter's 3.4). Design tokens live in a single `@theme` block in `src/app/globals.css`. | §3 asks for one token set defined once and reused. Tailwind 4's CSS-first `@theme` makes the tokens and the utility classes the same source of truth, instead of keeping a JS config and CSS variables in sync. `tailwindcss-animate` and `autoprefixer` were dropped as no longer needed. |
| 0.3 | **UI primitives are hand-styled on Radix + CVA**, not shadcn/ui via its CLI. | Owning the markup avoids the generic shadcn look §3 warns against, while Radix handles focus trapping, ARIA and keyboard behaviour for the Modal — the parts that are genuinely hard to hand-roll correctly. |
| 0.4 | **Visual direction: neutral slate + a single blue accent.** Typeface: IBM Plex Sans Arabic for both locales. | Chosen by the client for maximum data density in the back-office. One family with matched Arabic and Latin cuts keeps `ar` and `en` visually consistent without loading a second face. **If real brand assets arrive, only the `@theme` block needs changing.** |
| 0.5 | **`src/proxy.ts`, not `src/middleware.ts`.** | Next.js 16 renamed the file (and the export `middleware` -> `proxy`). `middleware.ts` still works but is deprecated and slated for removal. §6's tree has been updated to match. |
| 0.6 | **`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, not `..._ANON_KEY`.** | Supabase renamed the anon key to the publishable key (`sb_publishable_…`) and the project is issuing the new format. `src/shared/lib/env.ts` still falls back to the old name so an older `.env.local` keeps working. |
| 0.7 | **Cache Components (`cacheComponents: true`) left OFF.** | The starter had it enabled. It requires an explicit `use cache` / Suspense discipline throughout, which is a deliberate performance choice rather than a default. Revisit in Phase 10's caching pass (§11). |
| 0.8 | **Arabic UI uses Latin digits** (`ar-EG-u-nu-latn`), not Arabic-Indic. | Booking references, invoice numbers and credit figures are Latin throughout, so Arabic-Indic numerals beside them read inconsistently. **Open to reversal** — it is a one-line change in `src/shared/i18n/config.ts`, since all formatting flows through `src/shared/lib/format.ts`. |
| 0.9 | **Locale prefix is `always`**, so the default locale sits at `/ar/...` rather than `/`. | One URL shape to reason about in routing, canonical tags and future auth guards. |
| 0.10 | **Dark mode deferred.** | Not requested in this file and it would double the token and QA surface. The semantic token layer (`--color-surface`, `--color-ink`, …) is structured so a dark theme is an additive change, not a rewrite. |

### Post-Phase-0 scope change — decided 2026-09-06

Requested by the client after reviewing Phase 0, and folded into the sections above before Phase 1 started.

| # | Decision | Rationale |
|---|---|---|
| 1.1 | **Supplier API keys move out of the environment and into the database**, entered and rotated by the `super_admin` from the back-office. `HOTEL_SUPPLIER_*` env vars are deleted (§4, §9). | The keys belong to the business, not to a deployment. A leaked key can be rotated immediately without a redeploy, sandbox/production can be switched from inside the product, and onboarding a supplier stops being an ops task on every environment. |
| 1.2 | **Secrets are stored in Supabase Vault**, not a plaintext column, not app-level AES, not pgcrypto. | Vault keeps the master encryption key inside the Supabase project, so no new master-key env var is introduced and no key material appears in the repo or in `.env.local`. App-level AES would have required the client to generate and safeguard `CREDENTIALS_ENCRYPTION_KEY`, and rotating it would mean re-encrypting every row; pgcrypto risks the key appearing in query logs. |
| 1.3 | **No payment gateway, in any phase.** `PAYMENT_GATEWAY_*` env vars deleted; the former Phase 9 (gateway integration) is removed entirely. §10 rewritten from "deferred" to "settled". | Client decision. Recording this as settled rather than deferred matters: it stops a future session from re-adding gateway scaffolding "to be safe". |
| 1.4 | **The `payments` table stays**, as the ledger behind manual reconciliation (bank transfer, cheque, cash). | Removing gateways removes *online* payment, not the concept of payment. The credit-limit model in §10 depends on a payment ledger; without it there is no statement of account and no reconcilable balance. An agent's balance is derived from this ledger, never typed in directly. |
| 1.5 | **Access control becomes dynamic RBAC.** The `super_admin` creates roles and assigns permissions from the back-office; §7 rewritten. | Client requirement. The four original roles become protected *system* roles, with custom back-office roles created alongside them. |
| 1.6 | **Permissions are named keys grouped by module** (`agencies.approve`, `bookings.cancel`), not a per-module CRUD matrix. | The important actions in this product are not CRUD — approving an agent, suspending a company, cancelling a booking, recording a payment. A CRUD matrix would have forced those into "edit", which is both imprecise and dangerous. |
| 1.7 | **Custom roles are back-office-scoped in Phase 2**; agent sub-user permissions stay with the `agent_owner`. A `scope` column (`admin` \| `agent`) exists from the first migration. | Keeps Phase 2 tractable while leaving the schema ready for client-defined agent roles, so adding them later is data, not a migration rewrite. |
| 1.8 | **RLS policies must call `has_permission()`**, never compare role names. | With dynamic roles, `role = 'staff'` in a policy silently fails to cover the fifth role someone creates. A `SECURITY DEFINER` resolver keeps every policy correct as roles change. |
| 1.9 | **Lockout protection is a database trigger.** `super_admin` cannot be deleted or stripped of permissions, and the last active `super_admin` cannot be demoted or suspended. No role can grant a permission its holder lacks. | An access-control system that can lock its owner out, or that lets `settings.roles.manage` escalate to full access, is a defect rather than a configuration mistake. |
| 1.10 | **Phases renumbered.** With gateway integration removed: Phase 9 is now External supplier expansion (was 10) and Phase 10 is Hardening/testing/launch (was 11). Code comments referencing Phase 11 were updated. | A hole in the phase list reads as an error to a fresh session. Renumbering now, while only Phase 0 exists, costs almost nothing. |

**Known gaps deliberately left open at the end of Phase 0:**
- `POST /api/media/signature` is **unauthenticated** — Supabase Auth does not exist until Phase 1. Mitigated by a rate limit and a server-pinned upload folder. **Phase 1 must add a session check before any real media feature ships in Phase 3.**
- `src/shared/lib/rate-limit.ts` is in-memory and per-instance. Adequate for now; Phase 10 replaces it with a shared store.
- `src/shared/types/database.ts` is a placeholder for an empty schema. Phase 1 regenerates it via `npm run db:types`.
- `/[locale]/ui-kit` is an internal verification page and should be excluded from the production build in Phase 10.
- The Supabase CLI one-time setup (`npx supabase login` / `link`, §4) has **not** been done yet — it needs a human and must happen before Phase 1's first migration.
