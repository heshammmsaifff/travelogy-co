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

These five always exist. They cannot be deleted or renamed, and that is enforced by a database trigger, not merely hidden in the UI:

- `super_admin` — implicitly holds **every** permission, including permission management itself. Never evaluated against the permission table; it short-circuits to "allowed" (see the lockout rule below).
- `staff` — the baseline back-office role. Its permission set *is* editable.
- `agent_owner` — the primary user of a registered agent company; manages that company's profile and sub-users.
- `agent_user` — a sub-user under an agent company, scoped by the `agent_owner`.
- `driver` — added in Phase 8b. Belongs to no agency, holds no permission keys,
  and sees only the transfer jobs assigned to them — never a price. Their
  access comes from the assignment row, not from a grant (§15, 16.1).

### Custom roles

The `super_admin` can create any number of additional **back-office** roles — "Reservations Officer", "Accountant", "Content Editor" — and tick exactly which permissions each one holds.

Agent-side permissions remain with the `agent_owner`, who assigns them to sub-users inside their own company. Roles carry a `scope` column (`admin` | `agent` | `driver`) from the first migration, so client-defined agent roles can be introduced later without reshaping the schema — but only `admin`-scoped custom roles are built in Phase 2. **A layout that turns someone away must send them to `landingPathFor(user)`, never to the other side by name** — with three scopes, "not admin" no longer means "agent" (§15, 16.x).

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
- **Do not run `git add`, `git commit` or `git push`.** The client stages and commits
  everything themselves so they can review the work first (decided 2026-09-08, replacing
  the earlier "commit logically per phase" instruction). Finish a phase or a fix, run
  lint/tsc/build, report what changed and why — then stop and leave the tree dirty for
  them. Suggesting a commit message when handing work over is welcome; running the
  command is not.
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

### Phase 1 (database & auth foundation) — decided 2026-09-06

| # | Decision | Rationale |
|---|---|---|
| 2.1 | **`has_permission()` and the protection triggers were built in Phase 1, not Phase 2.** Phase 2 keeps the management *UI*. | §13 lists them under Phase 2, but §7 rule 1 forbids RLS policies from comparing role names — so Phase 1's policies could not be written without the resolver. Shipping the schema without the lockout and escalation triggers would have meant a window where the guarantees in §7 were documented but not enforced. |
| 2.2 | **The agent's running balance is not a column.** `agencies` holds `credit_limit` only. | §10 says the balance is derived from the payments ledger. A `balance` column in Phase 1 would be a number nothing maintains — exactly the fake-completeness §2.3 prohibits. The agent dashboard says so on screen rather than showing a misleading zero. |
| 2.3 | **Self-registration always produces `agent_owner` + `pending`, ignoring signup metadata.** | `raw_user_meta_data` is client-controlled. Verified: an account created with `role_key: super_admin` and `status: active` in its metadata still lands as a pending agent. |
| 2.4 | **The first super admin is created by `bootstrap_super_admin(email)`**, which refuses to run once any active super admin exists. | Seeding an admin account in a migration would mean committing a password. This promotes an already-registered user, and self-disables so it cannot become a back door. |
| 2.5 | **Auth forms use Server Actions + `useActionState`, not React Hook Form.** | §3 specifies RHF + Zod, and the longer forms in later phases will use it. On auth screens progressive enhancement matters more: a plain form works before JavaScript loads. The same Zod schemas still run server-side, which is what §12 actually requires. |
| 2.6 | **Route guarding is split: the proxy checks for a session, the layouts check role and status.** | §6 puts guards in the proxy. A full role check there would cost a database round trip on every navigation (§11), whereas the layouts must load the profile anyway to render their header. The proxy stops anonymous traffic; the layouts route people to the right side. |
| 2.7 | **Email is denormalised onto `profiles`** and kept in sync by a trigger on `auth.users`. | Admin screens need to search and sort by email; reading `auth.users` for that would require the service role on an ordinary listing page. |
| 2.8 | **Agencies and profiles are never deleted, only suspended.** No DELETE policy exists on either table. | Bookings, invoices and audit rows must keep pointing at a real company and a real person. |

**Security issues found by the Phase 1 verification suite and fixed before the phase closed:**
- `write_audit` was exposed as a PostgREST RPC, so any signed-in user could have forged audit-log entries. All SECURITY DEFINER functions are now revoked from `anon`/`authenticated` except the four that RLS policies evaluate as the caller (migration `20260906190400`).
- **Privilege escalation:** the profile guard only checked `auth.uid() = new.id`, so an agency owner holding `agency_users.manage` could set one of their own sub-users' role to `super_admin`. Confirmed exploitable, then fixed (migration `20260906190500`). The guard now covers every row and every field.
- **Self-serve credit:** `agencies_update` granted the owner their whole row, so they could raise their own `credit_limit` (verified: 0 -> 999,999) and flip their own status. RLS grants rows, not columns — a column-level trigger now protects credit, status, code and the approval trail.

**Operational blocker for real registrations (needs the client's action):**
Supabase's built-in SMTP is rate-limited to a handful of emails per hour and is not intended for production. Registration depends on email confirmation, so a custom SMTP provider must be configured in the Supabase dashboard (Authentication -> Emails) before real agents can sign up. This is configuration, not code.

### Phase 2 (back-office core & access control) — decided 2026-09-06

| # | Decision | Rationale |
|---|---|---|
| 3.1 | **An agency's status now gates its users' access.** `is_active_user()` and `has_permission()` both require the caller's agency (when they have one) to be active. | Phase 1 tracked the two independently, so an active owner of a suspended agency could still sign in and use the portal. Making it a property of the two resolver functions means every RLS policy inherited the fix at once, rather than each policy having to remember. |
| 3.2 | **Suspending an agency leaves member profiles untouched.** | Because of 3.1 the suspension already locks everyone out. Cascading a status change onto each profile would destroy the record of who was *individually* suspended, and reactivating the company would silently reinstate them. |
| 3.3 | **Approve/reject/suspend are SECURITY DEFINER RPCs, not client-side updates.** | Approving an agency has to activate the company *and* its pending owner. Two statements from the client could half-apply and leave an approved company nobody can sign in to. Each RPC re-checks the caller's permission itself, so it is a gate rather than an open door. |
| 3.4 | **Staff accounts are created with a generated temporary password, shown once**, plus a `must_change_password` flag enforced by the back-office layout. | `inviteUserByEmail` is the better flow, but this project's Supabase SMTP is rate-limited to a handful of messages an hour (see the Phase 1 blocker), so an invite flow would fail silently in real use. The flag ensures an account never stays usable on a credential the creating admin has seen. **Switch to email invites once SMTP is configured.** |
| 3.5 | **The audit trail is written by database triggers, not by the use-cases.** | A use-case can forget to log, and a direct SQL edit would leave no trace at all. Triggers on `roles`, `role_permissions`, `profiles` and `agencies` mean the record exists regardless of which path made the change. Permission changes are diffed, so the log records individual grants and revocations rather than a churn of every permission each time a box is ticked. |
| 3.6 | **The agency status counts come from a `security_invoker` view**, not from counting rows in JavaScript. | §11 requires aggregation in Postgres. `security_invoker = on` is essential: without it the view would run as its owner and leak counts of agencies the caller cannot see. |
| 3.7 | **`forbidden()` (via `experimental.authInterrupts`) rather than a 404** for a page the user lacks permission for. | A 404 would leave a staff member unable to tell whether they mistyped a URL or need access requesting. |
| 3.8 | **Roles and staff management live in `modules/auth`; agency management in `modules/agencies`.** | §6's module list has no `staff` or `access` module. Roles, permissions and back-office users are all "who may do what", which is the auth module's concern. |
| 3.9 | **List filters live in the URL, not component state.** | A filtered view is then shareable and survives a refresh, and the list pages stay Server Components with no client JavaScript (§11). |

**Bug found by exercising the schema, and fixed in this phase:**
`agencies.approved_by` is `on delete set null`, so deleting a back-office user makes Postgres issue its own `update agencies set approved_by = null`. The Phase 1 field-protection trigger refused that, which meant **once an admin had approved anything, their account could not be deleted at all**. Migration `20260906200200` treats "no authenticated user" as a system context, which is safe because every policy on `agencies` is scoped `to authenticated`.

**Second configuration item for the client (alongside the SMTP blocker):**
Supabase's leaked-password protection is disabled. Turning it on (Authentication -> Policies) checks new passwords against HaveIBeenPwned and costs nothing. Configuration, not code.

### Email delivery — decided 2026-09-06

Registration was failing in testing with a message that read "too many attempts". The cause was **Supabase's built-in SMTP**, which is shared across projects and capped at a few messages an hour; it returns `429 over_email_send_rate_limit`, which the code was reporting with the same message as its own rate limiter.

| # | Decision | Rationale |
|---|---|---|
| 4.1 | **Email confirmation is switched OFF for now** (Authentication -> Sign In / Providers -> Email). | Unblocks development immediately. The security cost is small here: admin approval is the real gate on an agent account, and it is unaffected. What is lost is proof that the address is reachable. |
| 4.2 | **Configuring a custom SMTP provider and re-enabling email confirmation is a MANDATORY Phase 10 item, not optional.** | From Phase 5 the platform emails vouchers and invoices to addresses agents typed themselves. Without confirmation those can be wrong, and without real SMTP they will not send at all. |
| 4.3 | **`registerAction` adapts to whichever setting is live.** `signUp` returns a session only when confirmation is off; in that case the user goes straight to the awaiting-approval screen rather than one telling them to check an email that will never arrive. | Neither configuration should produce a screen that lies (§2.3). |

**Two bugs this diagnosis exposed, both fixed:**
- **Supabase's email-send limit and our own rate limiter returned the same message**, so an unfixable provider condition was indistinguishable from "you clicked too fast". They are now separate messages, and the unexpected branch logs the real status/code server-side instead of discarding it.
- **`x-forwarded-for` is absent on a direct connection**, which is every request to `next dev`. The rate-limit key therefore collapsed to `register:unknown` for everyone, throttling the whole machine to a handful of sign-ups an hour — indistinguishable from a real fault. The guard now reads `x-forwarded-for`, `x-real-ip` and `cf-connecting-ip`, and when no address can be resolved it fails **open in development** (one developer, no attacker) and **closed in production** (a deployment without a forwarding header is misconfigured). The registration limit also rose from 5/hour to 10/hour, because a travel agency's branches often share one NAT address.
- Rate-limit responses now carry the wait time, so the user is told when to retry instead of being left guessing.

### Bootstrap and orphan agencies — fixed 2026-09-07

Two bugs found when the client ran the documented first-run step.

| # | Bug | Fix |
|---|---|---|
| 5.1 | **`bootstrap_super_admin()` could not run from the SQL editor** — the one place §15 tells you to run it. Its profile guard's system-context escape tested only `auth.role() = 'service_role'`, but the SQL editor is `postgres` with no JWT, so `auth.role()` is NULL. The guard fell through to its ordinary rules, and bootstrap runs precisely when no super admin exists to satisfy them. | The guard now treats `auth.uid() is null` as a system context, matching the agencies guard fixed in `20260906200200`. **Why it was missed: every test called bootstrap through a service-role client, where `auth.role()` really is `service_role`. The documented path was never the one exercised.** Test through the route the docs describe, not only the one that is convenient from a script. |
| 5.2 | **An agency outlived its last member.** `profiles` cascades from `auth.users` and from `agencies`, but nothing points back — so deleting a user left the agency as a company with no members, stuck in `pending`, sitting in the approval queue and holding a code that would never be used. | An `after delete on profiles` trigger removes an agency once its last member is gone. Also: bootstrap now removes the agency the signup trigger created for the account being promoted, since a super admin belongs to no agency. |

**Standing rule this produced:** every guard with a system-context escape must accept `auth.uid() is null`, not just `auth.role() = 'service_role'`. That is safe because every RLS policy on these tables is scoped `to authenticated`, so an anonymous request cannot reach an UPDATE at all — a null `auth.uid()` there means Postgres itself, a migration, the service role, or the SQL editor.

### Phase 3a (hotel inventory) — decided 2026-09-07

| # | Decision | Rationale |
|---|---|---|
| 6.1 | **Agents get NO direct read on any hotel table**, not even active properties. | `rates` are contracted net prices, and the gap between them and the agent's quote is the client's margin. A SELECT policy exposing `rates` would leak it, and no care in the application would put it back — RLS is what the PostgREST endpoint enforces and agents hold a real token against it. Phase 3c gives agents availability and sell prices through a function that applies markup. |
| 6.2 | **Rate periods are stored as a `daterange` with a database EXCLUDE constraint.** Two rates covering the same night for the same room and plan are impossible. | An overlap is not a display bug — it is a booking charged the wrong amount, decided by whichever row a query happened to return first. Validation in the UI can be forgotten; the constraint cannot. |
| 6.3 | **Admins enter the first and LAST night; the database stores half-open `[from, to+1)`.** | That is how a contract is written and how a season is thought about. The conversion means Jun 1-30 and Jul 1-31 meet exactly, instead of colliding on the 30th or leaving it unpriced. Verified round-tripping in both directions. |
| 6.4 | **`standard_occupancy` is separate from `max_occupancy`.** The nightly rate covers the former; guests beyond it are charged the extra-adult/child price. | It is what lets one room sell at different prices for two, three and four guests without duplicating the rate row per party size. |
| 6.5 | **Allocation is one row per room type per night**, entered through a bulk range form. | Contracts are negotiated in blocks ("20 rooms, June to September"), but a stop-sell or an allotment change applies to a single night. Per-date rows serve both; the bulk form keeps entry sane. |
| 6.6 | **`allocations.sold` exists but nothing in Phase 3 writes it.** | The booking engine in Phase 5 owns it. Incrementing it here would be inventing a number, and the column comment says so. |
| 6.7 | **Publishing a hotel with no active room type is refused**, with the reason shown. | An empty property in front of agents is worse than a draft that will not publish. |
| 6.8 | **Deleting a hotel image leaves the Cloudinary asset in place.** | Destroying it needs a signed call, and an orphaned asset is cheap whereas one deleted while an old voucher still references it is not. A sweep is a Phase 10 item, stated on the screen rather than left implicit. |
| 6.9 | **`/api/media/signature` is now permission-gated per folder.** | Phase 0 left it open to any active session, with a note to revisit. `hotels` requires `hotels.media.manage`, `banners` requires `cms.content.publish`, `documents` requires `agencies.update`. |

**Two bugs found by filling the forms — neither visible from reading the code:**
- **Every optional numeric field was rejected when left blank.** `z.coerce.number()` turns an untouched input's `""` into `0`, which then fails `.min(1)`; `.optional()` does not help because the key *is* present. It broke `maxStay`, `sizeSqm`, `starRating`, `minNights`, `freeNights` and allocation's `minStay`. Fixed with an `optionalNumber()` helper that strips `""` to `undefined` before coercion.
- **Constraint-specific error messages never reached the user.** The `toResult` helpers tested `error instanceof Error`, but Supabase rejects with a plain `PostgrestError` object, so every lookup ran against `"[object Object]"` and fell through to the generic fallback. The overlapping-rate message — the one case where knowing *why* actually matters — was the visible casualty. A shared `describeDbError()` now reads `message`/`details`/`hint`/`code`, and all three modules use it.

### Phase 3b/3c (supplier abstraction, search & pricing) — decided 2026-09-07

| # | Decision | Rationale |
|---|---|---|
| 7.1 | **Markup resolves most-specific-first: agency+hotel, then hotel, then agency, then global.** A partial unique index allows one active rule per exact scope. | Chosen by the client. The four-level shape covers a per-agency negotiated margin, a per-hotel contract margin, and the combination of both, without the resolution order ever being ambiguous. |
| 7.2 | **A global markup rule is seeded at install and cannot be deleted.** | Without one, a hotel or agency with no rule would sell at cost. Deleting it is refused rather than allowed with a warning. |
| 7.3 | **`search_availability()` does all the work in Postgres and returns SELL prices only.** The net total never leaves the function. | §11 wants aggregation in the database, but the stronger reason is §15 decision 6.1: doing this in JavaScript would mean the net rate existing in application memory, one refactor away from being serialised somewhere. Verified: the result set contains no net column. |
| 7.4 | **A room is offered only if EVERY night is priced and allocated.** One stop-sell night, one zero-allotment night, or one night with no allocation row removes the whole stay. | A partially available stay is not bookable, and offering it would produce a failure at the booking step instead of at search. |
| 7.5 | **A night with no allocation row is "not loaded", not "available".** | Treating a missing row as unlimited would sell rooms nobody released to us. |
| 7.6 | **The registry collects supplier failures instead of throwing.** One unreachable supplier does not take down a search our own inventory can answer; the page says results are partial. | Silently returning fewer results than exist is the failure mode §2.3 exists to prevent. |
| 7.7 | **The sandbox supplier is named "Sandbox supplier (test)" everywhere and is disabled by default.** | §9 asks for a stubbed external example. It genuinely proves the port, the registry, result merging and the Vault credential round trip — but it contacts nothing, so it says so in its name, its description, and its own connection-test message. |
| 7.8 | **`enabled_supplier_keys()` exists because agents cannot read `supplier_integrations`.** It returns provider keys and nothing else. | The table carries operational configuration and connection-test output. A search needs only to know which suppliers are on, and a key alone grants nothing since using one needs credentials only the service role can read. |
| 7.9 | **`createBooking`/`cancelBooking` exist on the port and throw `SupplierNotImplementedError`.** | §9 wants the whole seam present so Phase 5 does not reshape it. A method that returned an empty result instead would be indistinguishable from a genuine failure to book. |

**Bug found while cleaning up after the tests:** `set_supplier_credential` and `clear_supplier_credential` gated on `has_permission(auth.uid(), …)`, which is false under the service role because `auth.uid()` is NULL — so an ops script or migration could not rotate or remove a supplier key, and a cleanup call failed silently leaving the credential in place. Fixed in `20260907110300`, applying the standing rule from §15 (5.x): a system-context escape must accept `auth.uid() IS NULL`.

### Phase 4 (agent portal & public site) — decided 2026-09-08

Built at the client's request to run phases back-to-back rather than one at a
time, reviewing each before moving on (§2.5 and §13 relaxed by that instruction).

| # | Decision | Rationale |
|---|---|---|
| 9.1 | **Banners and static page content are database-backed from Phase 4**, with the CMS *editor* still arriving in Phase 6. Default copy for about/privacy/terms is seeded by migration. | §13 puts the marketing pages here and the editor there. Hardcoding the copy now would mean rewriting the public pages in Phase 6; seeding real content means the pages are genuinely complete today rather than shipping a placeholder privacy policy on a live site. |
| 9.2 | **`content_pages.body_*` is plain text rendered as paragraphs, never HTML.** | Phase 6 hands this field to a non-developer. A CMS field stored as text and rendered unescaped is a stored-XSS hole waiting for its first editor (§12). |
| 9.3 | **`cms.content.publish` was missing from the permission registry** and is seeded here. | It was already enforced by `/api/media/signature` for the `banners` folder, but §7 forbids granting a permission that does not exist — so no role could hold it and banner uploads were reachable only by `super_admin`, which short-circuits every check. Found while writing the banner table it gates. |
| 9.4 | **A quotation item is a full SNAPSHOT of the offer, not a foreign key to a live rate.** The capture time is stored and shown. | A quote is a promise made at a moment. Re-reading live prices would silently show the customer a different number tomorrow. External supplier offers have no row to point at either, and half-snapshot/half-reference would leak which supplier answered — exactly what the port exists to hide (§9). The cost, a price that can go stale, is stated on screen rather than hidden (§2.3). |
| 9.5 | **Quotations live in `modules/bookings`, not a module of their own.** | §6's module list has no `quotations`, and Phase 5 turns an accepted quotation into a booking — keeping both in one module makes that conversion local rather than a cross-module reach. Same reasoning as decision 3.8. |
| 9.6 | **Quotations are agency-scoped, not per-user.** Any active user of the company can open, edit and delete them. | A quote belongs to the company, not to whoever happened to build it; a colleague has to be able to pick it up when someone is away. |
| 9.7 | **The back-office cannot read quotations.** The super-admin clause was dropped rather than rewritten. | There is no permission key for reading another company's quotations, and inventing one inside the phase that builds the *agent* portal would put a back-office capability where it does not belong. If that need appears it arrives with its own key and its own screen. |
| 9.8 | **The agent dashboard's "coming soon" card was rewritten, not extended.** Search, quotations and the company profile moved into real links. | The card still said those were unavailable after this phase shipped them. Telling a user a working feature does not exist is the same dishonesty as the reverse (§2.3) — found by walking the portal rather than by reading the code. |
| 9.9 | **Booking history is an explicit "not built yet" page**, pointing at search and quotations. | An empty list would read as "you have never booked anything", which is false. There is no bookings table until Phase 5, and the page says so. |

**Three bugs found by testing, none visible from reading the code:**

- **RLS policies may only call the four functions the caller can execute.** Phase 1's
  hardening revoked EXECUTE on every SECURITY DEFINER function from `authenticated`
  except `authorize()`, `current_agency_id()`, `current_role_id()` and
  `is_active_user()`. The Phase 4 policies were written against `has_permission()`
  and `is_super_admin()`. The agent-denial tests **passed for the wrong reason** —
  the agent was stopped by `permission denied for function has_permission`, not by
  the policy deciding no — while a staff member who genuinely held
  `cms.content.publish` would have hit the same error and been unable to manage
  banners at all, a bug that would not have surfaced until Phase 6. Fixed in
  `20260908100200`. **Standing rule: a policy may only call those four.**
- **`buttonVariants` could not be called from a Server Component.** It was exported
  from `button.tsx`, which is `"use client"`, and a value exported from a client
  module cannot be *called* on the server — only rendered or passed as a prop. The
  CVA definition now lives in `shared/ui/button-variants.ts` with no `"use client"`,
  and `button.tsx` deliberately does **not** re-export it, so the trap cannot
  recur.
- **`<Button asChild>` around a `<Link>` fails on the homepage under `next dev`**,
  reporting `Slot failed to slot onto its children` — a Radix error that names the
  wrong culprit and sends you looking at button markup. The same page builds and
  serves correctly with `next build` + `next start`, so it is a dev-mode Turbopack
  issue rather than a defect in the markup. The marketing pages now style a `Link`
  with `buttonVariants()` instead, which is the library's own alternative and
  removes Slot from the path entirely. **`asChild` still works elsewhere** (the
  auth screens use it), so it is not banned — but a Server Component rendering a
  link as a button should reach for `buttonVariants()`.

**A trap worth naming:** incremental bisecting against a running `next dev` gave
contradictory answers for a long stretch — the same file returned 200 and then 500
with no change, because Turbopack was still serving a previous compile. Once the
question was put to `next build` instead, the answer was immediate and stable.
**When a dev-server symptom will not sit still, reproduce it against a production
build before drawing any conclusion from a bisect.**

### Phase 5a (booking engine) — decided 2026-09-08

| # | Decision | Rationale |
|---|---|---|
| 10.1 | **The credit rule is BLOCK, not warn.** A booking that would take the agency past its limit is refused inside `create_booking`, before any row exists. | §10 left this open ("block or warn — decide in Phase 2") and Phase 2 never did. A limit a user can click past is not a limit; this is a credit facility the operator controls, and the operator is not in the room when the agent books. |
| 10.2 | **The balance is derived, never stored.** `agency_outstanding()` sums bookings that still stand — pending, confirmed and completed. Cancelling releases the obligation. | §10 and §15 (2.2). Pending counts because the rooms are held and the agent is on the hook for them; only a cancellation frees both the stock and the credit. |
| 10.3 | **The price is re-derived server-side from `search_availability()`.** No amount travels from the browser. If the rate moved since the agent looked, the booking is REFUSED with that reason — never charged at either price. | §12 forbids trusting the client, but the stronger reason is that reusing the search function keeps one source of truth for pricing (§15, 7.3). A second copy in the booking path would eventually disagree with the one the agent was shown. |
| 10.4 | **Inventory is held at CREATION, not at confirmation.** | Otherwise two agents could both take the last room while their bookings sat pending. `allocations` already carries `CHECK (sold <= allotment)`, so the database refuses an oversell itself rather than leaving it to be discovered. |
| 10.5 | **There is no INSERT, UPDATE or DELETE policy on `bookings` or `booking_items`.** Every write goes through a SECURITY DEFINER RPC. | Pricing, the credit check, the inventory hold and the state machine have to happen in one transaction. Exposing the table would mean a client could create a booking without any of them. Verified: an agent cannot insert, re-price, delete, or flip `status` to confirmed. |
| 10.6 | **The agent may cancel their own booking; only `bookings.confirm` may confirm one.** | Confirmation is the operator's word that the hotel accepted it — an agent confirming their own booking would mean nothing. Cancelling is an ordinary thing for an agent to do, and both paths run the same function so inventory is always restored. |
| 10.7 | **A booking carries the agency's name and code as a snapshot**, alongside the foreign key. | Found by using the back-office as a "Reservations Officer" — a role with only the three booking permissions. The agency column read "—" for every row, because RLS on `agencies` correctly refused a role without `agencies.view`. Widening the role would have handed a reservations officer the whole agency directory, credit limits included, to render one column. The booking carries its own identity instead — which is also what a voucher needs after a company is renamed (same reasoning as 9.4). |
| 10.8 | **`complete_booking` refuses a stay that has not finished.** | A booking marked completed before check-out makes every later report wrong, and reports are Phase 7's whole subject. |

**Two defects found by the verification suite, both mine:**

- **The new RPCs refused every system context.** `confirm_booking`, `cancel_booking`
  and `complete_booking` gated on `has_permission(auth.uid(), …)`, which is false
  under the service role, from a migration, or from the SQL editor. This is
  **exactly the defect the standing rule in §15 (5.x) exists to prevent** — the rule
  had been applied to guards and then not remembered when writing RPCs. Fixed in
  `20260908120100`.
- **Four checks passed for the wrong reason, and one proved nothing at all.**
  "Confirming twice is refused" passed because the FIRST confirm was refused;
  "a booking over the credit limit is blocked" passed on *"that offer is no longer
  available"* — the test agency had simply run out of rooms, so the credit path was
  never executed. The suite now asserts the **reason** in the message, not merely
  that something failed, and the credit case books free dates so nothing else can
  refuse it.

**The lesson, stated plainly because it has now happened twice** (Phase 4's RLS
policies, and here): *a negative test that does not assert why it failed is not a
test.* Both times the code was genuinely broken and the suite was green.

### Phase 5b (finance) — decided 2026-09-08

| # | Decision | Rationale |
|---|---|---|
| 11.1 | **There is no balance column anywhere.** `agency_outstanding()` sums standing bookings, `agency_balance()` subtracts recorded payments, and `agency_statement()` unions the two sides with a running balance computed in Postgres. | §10 says the balance is derived from the ledger. A stored balance is a number nothing maintains and everything can disagree with; deriving it means the statement and the credit check cannot drift apart, because they are the same query. |
| 11.2 | **Available credit is measured against the BALANCE, not gross bookings.** Paying settles the account and frees the headroom again. | Phase 5a measured against outstanding bookings alone, because there were no payments yet. Left that way, an agent who paid everything would still have been blocked. |
| 11.3 | **Payments are immutable: no UPDATE, no DELETE, enforced by a trigger.** A correction is a second entry in the opposite direction (`kind = 'refund'`). | A ledger you can edit is not a ledger. It also means the fixtures for these tests cannot be fully torn down — the test agencies holding a payment survive, which is the design working rather than a leak. |
| 11.4 | **Amounts are always positive; `kind` says which way the money went.** | A negative receipt reads as a typo at a glance. Two explicit kinds keep every row readable on its own, and the statement puts a refund on the debit side because it increases what the agent owes again. |
| 11.5 | **Recording a payment is an RPC with no INSERT policy behind it.** | The reference is minted server-side and the audit row is written in the same transaction, so a payment cannot exist without either. Verified: an agent can neither insert one nor call the RPC. |
| 11.6 | **A booking now stores its own breakdown** — subtotal, discount, tax rate, tax amount — with a CHECK enforcing `total = subtotal − discount + tax`. | An invoice that shows only a total is not an invoice, and a breakdown that does not add up is worse than none. The identity is a constraint because it is the one thing about the numbers that must never be wrong. |
| 11.7 | **An unusable promo code REFUSES the booking rather than being ignored.** Every rejection names its reason: expired, exhausted, below the minimum, wrong agency. | Charging full price on a booking the agent believed was discounted is a silent difference that ends in a dispute. "Invalid code" for an expired one sends them to retype something that was never going to work. |
| 11.8 | **A code scoped to another agency answers `not_found`, the same as one that does not exist.** | Telling an agent that a code exists but belongs to someone else leaks a competitor's negotiated deal. |
| 11.9 | **`times_used` is maintained by a trigger on the redemption table**, never written by hand, and the admin form does not expose it. | A form that let an admin reset the counter would let a single-use code be used twice. |
| 11.10 | **Tax is seeded as a single zero-rated default, active.** No VAT percentage is invented. | The client has not stated their VAT position (§2.6 by analogy: do not invent a value that changes what customers are charged). The model is complete and the admin sets the real rate; until then every booking is taxed at zero, visibly. |
| 11.11 | **Currencies and exchange rates exist with no seeded rates.** | §13 asks for the model even with one currency exposed. Seeding a made-up rate would be inventing money. `currencies.decimals` is per-currency because rounding by a hardcoded 2 breaks on the first KWD or JPY contract. |

**Three defects found by the verification suite, all before any UI existed:**

- **`evaluate_promo_code` could not read a promo code at all.** Its RETURNS TABLE
  declares an OUT column named `code`, and the lookup was written
  `where upper(btrim(p_code)) = code` — ambiguous between the OUT variable and
  `promo_codes.code`, so Postgres refused the query outright. Every promo path
  failed with it.
- **`agency_statement` had the identical bug** with `entry_date`. Two functions
  written in the same sitting, the same mistake in both. **The habit that prevents
  it: inside a function whose OUT names mirror its data, alias every source and
  qualify every column.** Both are fixed that way rather than by renaming.
- **`my_credit_summary` could not be replaced in place.** Postgres refuses to
  change a function's return type through `create or replace`; it gained `paid`
  and `balance`, so it needs an explicit `drop` first. The migration rolled back
  cleanly, which is the only reason this was a five-minute fix.

**Found by walking the UI:** a promo code scoped to an agency that no longer exists
printed the raw UUID. It now says so in words — a fallback that shows an id is a
fallback nobody can read.

### Phase 5c (vouchers and invoices) — decided 2026-09-08

§3 left the PDF library to be chosen in Phase 5 "evaluating bundle/server cost".
The evaluation was run rather than reasoned about, and it changed the answer.

**What was tested.** `@react-pdf/renderer` was installed in a scratch project and
asked to render five lines — English, Arabic alone, Arabic with `direction: rtl`,
and Arabic mixed with Latin — using a font with full Arabic coverage. The output
was opened in a browser and looked at. Results:

| Case | Result |
|---|---|
| Arabic letterforms | **Correct.** fontkit applies OpenType shaping, so letters join properly. |
| Arabic alone | Correct. |
| Arabic + Latin in one line | **Word order wrong**, and the line clipped off the left edge. |
| `direction: rtl` | **Rendered nothing at all.** |
| Mixed with punctuation | Comma misplaced, leading letters cut off. |

So the shaping works and the **bidirectional algorithm does not**. For a product
whose default locale is Arabic (§5), that is not a rough edge — it is unusable.

| # | Decision | Rationale |
|---|---|---|
| 12.1 | **No PDF library. Vouchers and invoices are print-optimised pages, and the reader's browser produces the PDF.** | The browser implements the Unicode bidirectional algorithm and Arabic shaping correctly, which the library does not, and it costs nothing per document. |
| 12.2 | **A headless browser (Puppeteer) was rejected**, despite being the option that would render Arabic correctly server-side. | ~170–300MB of Chromium and roughly half a gigabyte of memory per render. §11 makes running well on modest tiers a first-class requirement, not a preference. |
| 12.3 | **What this costs, stated plainly:** there is no server-generated PDF file, so a voucher cannot yet be *attached* to an email. | Emailing documents needs custom SMTP first, which is already a blocker (§15, 8.7). When that lands and attachments are genuinely required, a headless renderer becomes a deliberate infrastructure decision with a cost the client can weigh — rather than one taken by accident now. |
| 12.4 | **Documents live at `/[locale]/documents/...`, outside both portal route groups.** | A voucher printed with a navigation bar down the side is not a voucher. `src/proxy.ts` still requires a session, and RLS still decides who may read the booking — the route is chrome-free, not access-free. |
| 12.5 | **The voucher shows NO prices.** | It is handed to the hotel at check-in. What the agency paid — and the margin inside it — is not the hotel's business (§15, 6.1 applied to paper). |
| 12.6 | **A voucher for a booking that is not yet confirmed says so on its face**, in the status banner. | Someone will print one the moment they book. A voucher that looks final but is not is worse than no voucher. |
| 12.7 | **A `company_profile` singleton was added.** | An invoice needs a "from" as much as a "to", and the platform had no record of its own legal name, address or tax number. The row is a singleton enforced by a CHECK, because a settings table that can hold two rows eventually will, and then every document has to pick one. |
| 12.8 | **The invoice states that settlement is on the credit account and there is no online payment.** | §10 is a settled product decision; saying it on the document stops a reader looking for a payment link that does not exist. |

**Why the print CSS carries the reasoning in a comment** rather than only living
here: the next person to touch those rules will be looking at the stylesheet, not
at this file, and "why is this printed by the browser?" is exactly the question
they will have.

### Phase 6 (CMS) — decided 2026-09-08

Phase 4 built the `banners` and `content_pages` tables and pointed the public
site at them, deferring only the editor. This phase is that editor — so there
is no migration here, and the whole phase is application code.

| # | Decision | Rationale |
|---|---|---|
| 13.1 | **One screen for banners and pages, not two.** | They answer the same question — "what does a visitor see" — and splitting them means two places to check before a launch. |
| 13.2 | **Both languages are edited side by side**, never behind a language switch. | These are legal pages. The commonest failure is one locale being updated and the other quietly left stale; showing them together makes that visible rather than easy. |
| 13.3 | **A banner's live state is computed in the UI only as a readout** (`live` / `hidden` / `scheduled` / `expired`), from the same three conditions the policy applies. | The label has to explain *why* a banner is not on the site. It is deliberately not a second rule: the database still decides. |
| 13.4 | **Deleting a banner leaves its Cloudinary asset in place**, as deleting a hotel image does (§15, 6.8). | Destroying it needs a signed call, and an orphaned asset is cheaper than one deleted while something still references it. The Phase 10 sweep covers both. |
| 13.5 | **The image is uploaded before the form is submitted**, and only its `public_id` travels in the form. | The server never accepts or stores bytes; it stores a reference to something Cloudinary already holds (§8). |

**Two bugs found by walking the CMS as a real content editor — neither visible
from the code, and neither caught by the RLS suite that passed first:**

- **The public homepage rendered differently for the person editing it.**
  `banners_manager_read` deliberately lets a `cms.content.publish` holder read
  hidden and scheduled rows so they can work on them. `getActiveBanners()` relied
  on RLS alone to filter — so an editor who hid a banner still saw it on the
  homepage, and *only they* did. They would reasonably have concluded the save
  failed. The public read now states the three public conditions itself: RLS is
  still the security boundary, but the page asks for exactly what the public may
  see rather than taking whatever the caller happens to be allowed.
  **The general rule: when a policy grants some readers MORE, a page that must
  show everyone the SAME thing has to filter for itself.**
- **Every page edited through the CMS rendered as one unbroken wall of text.** A
  browser textarea submits CRLF per the HTML spec, so saved copy arrives as
  `

` while the migration seeded `

`. The paragraph split matched only
  the latter. The seeded pages looked right and the first edited one did not —
  the sort of thing that ships because nobody edits their own seed data.

**A measurement mistake worth recording, because it nearly hid the second bug:**
paragraphs were counted with `grep -c`, which counts matching *lines* — and Next
emits the whole page on one line, so every page reported "1" whether it had one
paragraph or ten. `grep -o | wc -l` gives the real count (and doubles it, because
each class appears in the HTML and again in the RSC payload). **A measurement that
returns the same number for every input is not measuring anything.**

### Phase 7 (reports) — decided 2026-09-08

| # | Decision | Rationale |
|---|---|---|
| 14.1 | **The cost of a booking lives in its own table, `booking_costs`, not a column on `bookings`.** | A profitability report needs margin = sell − net, and nothing in the schema knew the net. The obvious fix — a `net_cost` column on `bookings` — is wrong for a reason this project has already been bitten by: **RLS grants rows, not columns** (§15, Phase 1, the self-serve credit bug). `bookings_read` lets an agent read their own booking row, so a cost column on it would hand every agent the client's margin. A separate table makes the boundary structural: an agent cannot reach it by selecting a column, and a later phase adding a field to a booking query cannot leak it by accident. |
| 14.2 | **`offer_net_total()` mirrors the net calculation inside `search_availability()`**, and is revoked from `authenticated` entirely. | Duplicated arithmetic is what §15 (7.3) warns against, so the mirror is as small as possible and the suite asserts the invariant `net + markup = sell` against a real booking. If the two ever drift, a test fails rather than the margin quietly going wrong. |
| 14.3 | **Reports are SECURITY DEFINER functions, not views.** | A view cannot take a date range, and a `security_invoker` view leaks counts unless every underlying policy lines up (§15, 3.6). One explicit permission check at the top of a function is easier to audit. |
| 14.4 | **`reports.export` is a separate permission from `reports.view`.** | Reading a margin on screen and walking out with the whole book of business in a spreadsheet are different acts. §7's registry already named both. |
| 14.5 | **The CSV is written with a UTF-8 byte-order mark.** | Excel on Windows opens a UTF-8 CSV as ANSI without one, turning every Arabic name into mojibake — a report that is technically correct and practically useless. Three bytes fix it. |
| 14.6 | **A cancelled booking is counted but earns nothing.** It appears in the cancellation rate and not in the money. | Counting its sell value as revenue would make a serial canceller the best-performing agent on the list. |
| 14.7 | **A booking with no recorded cost shows a BLANK margin, never zero profit.** | Bookings made before cost capture existed genuinely have no cost. Rendering that as full profit would overstate every early booking (§2.3), and the table says so beneath itself. |

**A revenue bug found by this phase, present since Phase 5a:**

**A multi-room booking was charged for one room.** `search_availability()` returns
`sell_total` **per room** — its `priced` CTE sums the nights and never multiplies
by `p_rooms`, which is used only to check availability. `create_booking` stored
that figure as the booking total:

| rooms | net cost | charged |
|---|---|---|
| 1 | 3,000 | 3,450 ✓ |
| 2 | 6,000 | 3,450 — half price |
| 3 | 9,000 | 3,450 — a third |

It survived the entire Phase 5 verification suite, every browser walkthrough and
two rounds of review, because **every one of those tests booked one room**. What
surfaced it was Phase 7: `offer_net_total()` does multiply by rooms, so the margin
went sharply negative and the report made the discrepancy impossible to miss.

Fixed in `20260908170000`, with the unit now stated in three places that a reader
would actually look at: a `comment on function` for `search_availability`, the
`SupplierOffer.sellTotal` doc on the port (external adapters must follow the same
rule), and the search page, which now shows the price for the number of rooms
being searched rather than for one.

**Nothing was backfilled.** The only affected rows were test fixtures, and
correcting a historical price would be inventing a charge nobody agreed to — a
real multi-room booking made before this fix has to be re-quoted by a person.

**The lesson: a parameter that every test passes the same value for is a parameter
no test has exercised.** `p_rooms` was in every call and varied in none of them.
The Phase 5 suite proved a great deal about the booking engine and nothing at all
about the one input it held constant.

### Phase 8a (transfers) — decided 2026-09-08

The first product after hotels, and therefore the first test of whether the
booking engine, the finance spine and the reports were built for *a* product or
for *hotels*.

| # | Decision | Rationale |
|---|---|---|
| 15.1 | **A transfer booking is a row in `bookings`, not a row in a second booking table.** `bookings` gained `product_type`, and the hotel-shaped columns are constrained per product rather than duplicated. | One spine means money is counted in exactly one place, which is the property §10 actually cares about. A `transfer_bookings` table would have needed its own credit check, its own statement entry, its own report — four places to keep in agreement, and the first disagreement would be an agent booking past their limit. Verified: a transfer counts against credit, appears on the statement and reports margin, through the *same* functions, with no changes to any of them. |
| 15.2 | **The date constraint is product-aware rather than relaxed.** A hotel booking must still have `check_out > check_in` and `nights = check_out − check_in`; a transfer must have `check_out = check_in` and `nights = 0`. | Generalising a table usually means loosening its constraints, and the loosening is what later lets a nonsense row in. A `CASE` on `product_type` keeps every hotel rule exactly as strict as it was. All 143 pre-existing checks still passed after the alteration, which is what made the change safe to keep. |
| 15.3 | **Transfers have no allotment.** Availability means "a rate covers this date and is not closed"; there is no oversell check and no `sold` counter. | A hotel releases a fixed number of rooms; a transfer operator sends another car. Inventing an allocation table would have meant inventing a capacity nobody contracted. **This is stated on the rates screen**, not just here, because it is the first question an admin who knows the hotel module will ask. If a fixed fleet is ever contracted, that becomes a capacity table and this decision is revisited. |
| 15.4 | **`transfer_rates` gets no agent-facing SELECT policy at all**, exactly as hotel `rates` gets none (§15, 6.1). Vehicles and routes are readable, because an agent must know what a "Minivan" is to choose one. | The gap between the contracted price and the agent's quote is the client's margin, and RLS is what the PostgREST endpoint enforces against a real agent token. Verified twice: through a signed-in agent, and through a staff member who holds `bookings.view_all` but not `transfers.manage` — both see zero rows. |
| 15.5 | **The search prices ONE vehicle, and both the card and the invoice column say so.** | This is the Phase 7 revenue bug (a multi-room booking charged for one room) refusing to be repeated in a new product. `create_transfer_booking` multiplies by `p_vehicles`, and the suite varies the count 1/2/4 rather than passing the same value every time — the exact omission that hid the hotel bug for three phases. |
| 15.6 | **The vehicle count is chosen in the booking dialog, not on the search form.** | It depends on which vehicle was picked: eight passengers is two sedans or one minibus. Asking before the choice is made would be asking a question the agent cannot yet answer. |
| 15.7 | **A flight number is asked for only on an airport leg.** | A field nobody on a city-to-city transfer can fill in is a field that teaches people to skip fields. |
| 15.8 | **`toHalfOpenRange`/`parseDateRange` moved to `shared/lib/date-range.ts`.** | Hotel rates, hotel offers and now transfer rates all use the same `[from, to+1)` conversion (§15, 6.3). A third private copy of an off-by-one is three chances to get it wrong in only one of them. |

**A limitation worth naming rather than discovering later:** `search_transfers`
only offers vehicles that seat the WHOLE party (`max_passengers >= p_passengers`),
so a party of six is never offered two sedans — only a minivan or larger. That is
the schema's own rule from the migration, and it is defensible (one party, one
vehicle, one pickup), but it does mean the multi-vehicle path is reached by an
agent raising the count deliberately, not by the search suggesting it. Splitting a
party across smaller cars is a Phase 8b question, alongside driver assignment.

**Bugs found by walking the screens, none of them visible from the code:**

- **A fully-qualified error key resolved against a namespaced translator prints
  the key path.** The booking dialog showed `Transfers.Transfers.Errors.PastDate`
  where a message should have been: the action returns
  `"transfers.errors.pastDate"` and the component asked
  `useTranslations("transfers")` for it, which looks under
  `transfers.transfers.…`. **The hotel booking dialog had the identical bug and
  had had it since Phase 5a** — every failed hotel booking showed a raw key —
  along with the record-payment dialog and the company-profile form. The
  `useShow()` helpers most screens use were always correct because they call the
  ROOT `useTranslations()`; the four inline dialogs that did not use that helper
  were all wrong. Fixed in all four, with the reason in a comment at each.
  **The general shape: a helper that encodes a rule protects only the callers
  that use it.**
- **`common.edit` did not exist**, so every "edit" button on the transfers screen
  rendered the literal text `common.edit`. TypeScript cannot catch this and
  next-intl prints the key rather than failing, so it survives a clean build.
  A checker now resolves every literal `t("…")` in the phase's files against both
  catalogues; it also found the two below.
- **Two form fields carried the wrong label** — the rate form's *currency* input
  and the route form's *direction* select were both labelled "Route", a
  copy-paste that reads as a bug in the data rather than in the label.
- **`km` was a hardcoded string** in an Arabic UI, which §5 forbids.
- **The pickup notes printed twice.** `create_transfer_booking` stores them in
  `special_requests` so one column serves both products, and the detail page and
  the voucher each printed that column *and* the transfer card. The same sentence
  under two different labels reads as two different instructions to whoever is
  arranging the car.
- **Three hotel words on a transfer document**: the voucher was titled "Hotel
  voucher" and footed "present this at check-in … not the hotel's concern", and
  the invoice's unit column said "Per night" above a per-vehicle price. An
  invoice column that names the wrong unit is an invoice that cannot be checked.

**What the UI suite proved that the database suite could not:** `bookings` now
embeds two item tables, and PostgREST has to resolve both in one select. A hotel
booking returning a transfer row (or the reverse) would have been invisible in
SQL and wrong on every screen. Asserted explicitly in both directions.

### Phase 8b (driver operations) — decided 2026-09-08

The first users who are neither back-office staff nor agents. Both decisions
below were put to the client rather than guessed, because §13 asks for "a
responsive web view" without saying who signs into it.

| # | Decision | Rationale |
|---|---|---|
| 16.1 | **A driver is a real platform user, under a THIRD role scope: `driver`.** Chosen by the client over "no accounts, back-office only" and over per-job signed links. | A scope answers "which side of the product is this person on", and a driver is on neither existing side: no agency, no prices, one screen. Reusing `agent` would have put them inside an agency's RLS scope, which is precisely wrong. Signed links were rejected because §12 makes authentication Supabase Auth's job, and a link that can be forwarded or must be revoked is a second auth surface we would own. |
| 16.2 | **ONE ASSIGNMENT ROW PER VEHICLE.** Chosen by the client. Three cars is three jobs, three drivers and three independent states. | It is what happens on the day. A single status per booking cannot say "one car has arrived and one is stuck in traffic", and one driver cannot drive three cars. It also makes the vehicle count checkable: the board generates a row per required vehicle and the empty ones are the work. |
| 16.3 | **The enum value is added in its own migration.** `20260908190000` does nothing but `alter type role_scope add value 'driver'`. | Postgres will not let a new enum value be *used* in the transaction that added it, and the Supabase CLI runs one migration per transaction. The split is the only order that works, not tidiness. |
| 16.4 | **`drivers` is a table beside `profiles`, not columns on it.** The phone is duplicated there deliberately. | Licence details and availability are operational data that agents and staff have no business sharing a table with. The phone is duplicated because `profiles.phone` is optional and owned by the user, while dispatch must always have a number to ring — the same reasoning that puts a snapshot on a booking (§15, 9.4). |
| 16.5 | **A driver is never deleted** (`on delete restrict` from assignments), only deactivated — and `set_driver_active()` moves the fleet flag and the account status **together**. | §15 (2.8) for the deletion; the RPC for the pairing, mirroring approve/suspend on the agency side (§15, 3.3). Letting the two drift produces either a driver assigned work they cannot see, or one who signs in to a list that will always be empty. |
| 16.6 | **The clash rule is an EXACT match only**: same driver, same day, same minute, enforced by a partial unique index. | A dispatcher also cares about travel time between two jobs an hour apart, but any window this migration picked would be a business rule nobody stated (§2.6 by analogy). What is certain is that the same driver at the same minute is a double-booking. **Travel-time conflicts are therefore not modelled** — stated here so the omission is not read as an oversight. |
| 16.7 | **Pulling a driver CANCELS the row rather than deleting it**, and the uniqueness indexes are partial on `status <> 'cancelled'`. | "This driver was assigned and then taken off" is exactly the fact you want when a guest complains about a late car. Plain table constraints would have let that dead row go on blocking the seat it no longer occupies. |
| 16.8 | **The state machine is forward-only, and the driver's screen offers only the legal next steps.** Only dispatch may cancel. | The timestamps behind those states are what a later dispute is settled with. A status dropdown would let a driver mark a job completed before arriving — the database refuses it, but the screen should not offer it. A driver who cannot do a job rings the office; deciding what replaces them is not their call. |
| 16.9 | **`my_driver_jobs()` returns NO price column of any kind.** Not sell, not net, not currency. | §15 (12.5) applied to a screen. Because the function returns columns rather than the table, this is structural: no later change to the driver page can leak a price, and the suite asserts the absence of the column rather than the absence of a rendered number. |
| 16.10 | **An agent may see the driver's name, phone and status — through a function returning three fields**, never through a policy on `drivers`. | The agent's customer asks who is coming, so the agent needs an answer. But RLS grants rows, not columns (§15, Phase 1), and a `drivers` row carries a licence number. Same structural reasoning as `booking_costs` (§15, 14.1), pointing the other way. |
| 16.11 | **Cancelling a booking cancels its live jobs, by trigger** — but leaves a completed one alone. | Otherwise a driver keeps an arrival on their list for a booking that no longer exists, and drives to it. A journey that already happened is history, and cancelling the booking afterwards must not rewrite it. |

**The dangerous part, and why it needed its own migration.** The profile
privilege guard was written as `if scope = 'admin' … else <agent rules>`. A
third scope falls into the ELSE. For role changes that was fail-closed — the
agent branch demands `agency_users.manage` and a matching `agency_id`, and a
driver has neither — but the **status** branch was not: its `elsif` chain lets
anyone holding `agencies.approve` or `agencies.suspend` change the status of a
non-admin account, which would have included every driver. Both branches now
name `driver` explicitly and gate it on `drivers.manage`.

**Two vacuous passes in the same run, and the real bug hiding behind them.**
The first version of the suite asserted that an approver got an *error* when
suspending a driver. It did not: **an UPDATE that RLS filters to zero rows
returns no error from PostgREST.** So one check reported protection where the
guard had never run, and the neighbouring check — "a `drivers.manage` holder
can" — reported success for a call that had also done nothing. Rewriting both
to ask what the ROW said afterwards exposed the actual gap:

- **`drivers.manage` could not manage a driver.** `profiles_select` grants
  visibility to `agencies.view` or `staff.view` and `profiles_update` to
  `staff.update`, so the new permission could write the `drivers` table but
  could not read the person's name or change their account status — a
  permission that did not do what its name said (§2.3). Fixed in
  `20260908190300`: the policy now admits driver-scoped rows for fleet roles,
  and status changes go through `set_driver_active()`.
- **`set_driver_active()` then failed on every call.** `status = case when …
  then 'active' else 'suspended' end` gives Postgres two untyped literals and
  nothing to infer from, so the CASE typed as `text` and the assignment was
  refused. Its companion check ("and reactivates both") had been passing the
  whole time, because the driver it expected to find active had never been
  deactivated. Fixed with explicit casts in `20260908190400`.

**The general shape, since this is the third phase it has appeared in:** *a
check that cannot distinguish "it was refused" from "it did nothing" is not a
check.* Phase 4 had it with RLS policies, Phase 5a with booking refusals, and
here with silent no-op UPDATEs.

**A redirect loop this phase would have shipped, found by reading rather than
running:** `(admin)/layout` sent a non-admin to `/agent` and `(agent)/layout`
sent a non-agent to `/admin`. With two scopes each was a correct guess about
the other's audience; with three, a driver landing on either would have
bounced between them forever. Both now redirect to `landingPathFor(user)`,
which is the single place that knows where a person belongs.

**Found by walking the screens:**

- **Arabic plural agreement was wrong at 1 and 2** — the board read "1 مركبات"
  and the transfer search "2 حقائب". Arabic has six plural forms, and ICU's `#`
  would render Arabic-Indic digits, which §15 (0.8) deliberately does not use.
  Labelling the number instead ("المركبات: 2", "Seats: 4") is correct at every
  count in both languages and keeps Latin digits. The Phase 8a strings had the
  same flaw and were fixed with it.
- **The "who is driving" card counted the wrong total.** It labelled a car
  "1 of N" using the number of drivers ASSIGNED, so the first of three cars
  read "car 1 of 1" until the rest were filled. It now takes the booking's own
  vehicle count.

### Phase 8c (packages and tours) — decided 2026-09-09

The third product, and the first one whose shape §13 did not imply. Both
decisions below were put to the client rather than guessed.

| # | Decision | Rationale |
|---|---|---|
| 17.1 | **A package is a FIXED TOUR with dated departures**, not a dynamic bundle assembled from live hotel and transfer inventory. Chosen by the client over dynamic packaging and over building both. | It is what an operator in this market actually sells, and it reuses the existing spine without inventing cross-product inventory holds. The rejected option was not rejected as wrong — dynamic packaging is a real product — but it needs availability across several nights and cities and an atomic hold spanning three inventory models, which is a phase of its own rather than a corner of this one. |
| 17.2 | **Pricing is PER PERSON BY OCCUPANCY** — single, per person sharing, triple, child. Chosen by the client over a flat per-booking price. | A flat price cannot express a single supplement, which is the one number every tour quote has. The supplement is not stored: it is the gap between the single and double rates, so it can never disagree with them. |
| 17.3 | **A booking carries one item row per occupancy sold.** "2 sharing + 1 single" is two lines. | It is how the invoice reads and how the money adds up. A single row with four counts would have to re-derive each line's price to print the invoice, which is a second pricing rule (§15, 7.3). |
| 17.4 | **`return_date` is computed by a trigger from the package's own length**, never typed. | A departure that disagreed with its tour would be rejected by the booking's `nights = check_out − check_in` constraint — so the failure would surface at the moment an agent tried to book, blaming the booking rather than the bad data. Verified: entering a wrong return date is silently corrected, and moving a departure recomputes it. |
| 17.5 | **Departures DO have capacity and DO refuse an oversell**, unlike transfers, which deliberately have none (§15, 15.3). | A coach and a guide hold a fixed number of people; a transfer operator sends another car. The difference is real, so the two products model it differently rather than sharing a rule that would be wrong for one of them. Said on the departures screen, not only here. |
| 17.6 | **Seats are held at CREATION and released by a TRIGGER on cancellation.** | Holding at creation is §15 (10.4) — otherwise two agents both take the last seats while their bookings sit pending. The release is a trigger rather than a branch inside `cancel_booking` because it is strictly additive to a function that already works and fires whatever path cancels. **The hotel release stays inline where Phase 5a put it**: moving it would risk a double release, and that refactor deserves its own change rather than riding along with a new product. |
| 17.7 | **An occupancy with no rate REFUSES the booking, by name**, rather than being charged at zero. | Charging nothing for a traveller the agent entered is worse than refusing: the money is wrong and nobody finds out until reconciliation. The dialog also disables the counter, so the screen does not offer what the database will refuse. |
| 17.8 | **The rate period is matched against the DEPARTURE date, not every night of the tour.** | A tour is priced by when it leaves; a season boundary in the middle of a fifteen-night itinerary is not how a contract is written. The same half-open `daterange` + EXCLUDE constraint as hotel and transfer rates (§15, 6.2/6.3). |
| 17.9 | **Search returns one row per departure with the four occupancy prices pivoted into columns.** | An agent choosing a date is comparing "what does this leave at, and what does a single cost". Four rows per departure would make them reassemble it. |

**A build failure worth recording, because it is the third instance of one
shape.** `OCCUPANCIES` was exported from the repository, which carries
`import "server-only"` — so the moment a `"use client"` booking dialog imported
it the client build failed. It now lives in `modules/packages/domain/`, which
§6 reserves for things that depend on nothing and both sides may import. This
is the same trap as `buttonVariants` in §15 (Phase 4): **a value both sides
need cannot live in a module only one side can import**, and the compiler only
says so at build time, never at `tsc`.

**Found by walking the screens — all four are the same category, and it is now
a predictable one:** when a product joins a shared surface, the shared copy is
still written for the product that came first.

- The booking detail labelled a tour's date range **"Stay"**, a hotel word for
  something that is a departure and a return.
- The voucher's section heading read **"Packages"** (a menu label) and the tour
  name sat under **"Name (EN)"** (a form-field label). Neither belongs on a
  document handed to an operator.
- The cancellation dialog promised that **"the rooms go back into inventory"**
  — true of a hotel, false of a transfer, and only half-right for a tour. It
  now says what is actually common to all three: whatever the booking was
  holding is released.

**A pass that proved nothing, caught by re-reading rather than by failing.**
"A departure that has already left is refused" passed on the wrong branch: the
fixture had no rate covering a past date, so `search_packages` returned nothing
and the refusal was *"no longer available"* rather than the past-date rule
under test. Giving the fixture a rate that covers the past made the intended
branch run — and it does. **The suite now also asserts the fixture is
findable before asserting that booking it is refused**, because a refusal
against something that was never there is not a refusal.

### Phase 8d (CRM) — decided 2026-09-09

The last part of Phase 8, and the only module whose subject is the CLIENT'S own
sales work rather than something an agency buys.

| # | Decision | Rationale |
|---|---|---|
| 19.1 | **The CRM is the client's tool and its subject is travel agencies** — prospects being courted, and existing agencies being followed up. Chosen by the client over an agent-facing address book for travellers. | In a B2B platform the customers are the agencies, so "manage the customer relationship" means managing them. The rejected option is a real product too, but it would have given the platform's owner no sales tool at all, which is what a CRM is for. |
| 19.2 | **NO agent-facing policy exists on any CRM table**, and that is the point rather than an omission. | This inverts every other table in the schema. `crm_activities.agency_id` points at a company that holds a real token against PostgREST, and the rows beside it are the sales team's private view — "they are shopping around", "hold their credit limit where it is". An "own agency" read here would hand each company its own file. Verified with the agency's own token: zero activities, zero tasks, zero leads, and zero when filtering by their own id explicitly. |
| 19.3 | **The CRM never creates an agency.** Winning a lead LINKS it to one that registered and was approved through the normal route. | Agencies exist only through self-registration plus approval (§15, 2.3 and 3.3). A second path into existence would be a way around the approval gate §7 puts there. The convert dialog says so on screen, because "mark as won" reads like it might create something. |
| 19.4 | **Activities and tasks are ONE table each, covering a lead or an agency**, with `num_nonnulls(lead_id, agency_id) = 1`. | It is the same thing — a record of contact — before and after a company signs. Two tables would mean two shapes and two queries, and the question "was this said before or after we signed them" needs both timelines to look identical. One component renders both for the same reason. |
| 19.5 | **A stage that means something carries its evidence**: `won` requires the agency snapshot, `lost` requires a reason, both as CHECK constraints. | A pipeline that cannot say why it lost is a list. Moving BACKWARDS is deliberately allowed — a lost prospect who calls back is ordinary — so the constraints are about evidence, not about direction. |
| 19.6 | **`won` is unreachable from the stage dropdown.** The only way in is `convert_lead`. | A dropdown that set the stage without the link would produce exactly the row the CHECK refuses, so the screen would be offering a failure. |
| 19.7 | **A task's `status` and `completed_at` are bound by a CHECK**, and `set_task_status()` is the only thing that moves both. | "Done" with no timestamp is a label, not a record. Binding them means no screen has to remember the pairing — verified: flipping the status alone is refused by the table. |
| 19.8 | **Everyone with `crm.view` sees the whole pipeline**; there is no owner-only scoping. | This is a small operator's sales team, where the answer to "who is talking to them" has to be visible to everyone. If per-owner privacy is ever wanted it arrives as its own decision rather than being assumed now. |

**A bug found by a teardown that would not tear down — and it is the same
shape as one already in this log.** `crm_leads.agency_id` is `on delete set
null`, and `crm_leads_won_has_agency` demanded a non-null agency on a won lead.
So deleting an agency made Postgres issue its own `update crm_leads set
agency_id = null`, the CHECK refused it, the agency delete failed, the
profile-delete trigger failed with it — and **the last user of any agency that
had ever been won as a lead could not be deleted at all.** That is precisely the
Phase 2 `agencies.approved_by` bug (§15), rediscovered in a new table.

The fix is the pattern this project already uses for exactly this problem
(§15, 9.4 and 10.7): the lead now carries `won_agency_name`/`won_agency_code`
as a SNAPSHOT taken at conversion. The foreign key stays a live link and may go
null; the evidence lives in columns nothing can revoke. The lead survives its
agency, still won, with its link cleared — which is right, because the lead is
the sales team's record of their own work.

**Two bugs found by walking the screens, both of the same family: a screen
denying something that exists.**

- **The contact timeline was always empty, whatever was in the table.**
  `crm_*.created_by` referenced `auth.users`, so PostgREST could not resolve
  `author:profiles!crm_activities_created_by_fkey` — the whole select errored,
  and the repository's `data ?? []` rendered that error as "no contact logged
  yet". The toast said saved, the database had the row, and the screen said
  nothing was there. Fixed by pointing the column at `profiles` (whose `id`
  IS `auth.users.id`), matching how `owner_id` and `assigned_to` were already
  written — those two worked, which is what made the difference visible.
  **Every CRM read now logs its error instead of swallowing it**: §15 (7.6)
  said a failed search must never render as "nothing available", and that rule
  applies to reads, not only to searches.
- **`revalidatePath` was being given concrete URLs, not route patterns.**
  `revalidatePath("/[locale]/admin/crm/" + id)` names a path Next has never
  heard of, so the call quietly does nothing. Found here, but **the same
  one-line mistake was in five modules** — bookings, quotations, finance,
  packages and CRM. Only the hotels module had it right. All five now pass the
  pattern.

**The third instance of one trap, and the rule that should stop a fourth.**
`LEAD_STAGES` and friends were exported from the repository, which carries
`import "server-only"`, so the client build failed the moment the board
imported them. This is `buttonVariants` (§15, Phase 4) and `OCCUPANCIES`
(§15, Phase 8c) again — and it happened two turns after recording the second
one. **A value both sides need goes in `domain/` FIRST, and the repository
imports it from there.** `tsc` never catches it; only the build does.

### Country picker and hotel location link — 2026-09-09

Two client requests, both replacing a field that asked a person to transcribe
something they already had in front of them.

| # | Decision | Rationale |
|---|---|---|
| 18.1 | **Country is a picker over `i18n-iso-countries`**, not a typed two-letter code. Every one of the six country fields uses the same control. | A typed code is a field users get wrong regularly — "UK" for GB, "UAE" for AE — and a hand-written list goes stale the next time a country is renamed. The package was chosen over `world-countries` and `countries-list` for one reason: it ships the official ISO names in **Arabic**, which §5 requires and the other two do not. |
| 18.2 | **A search box filtering a NATIVE `<select>`**, not a custom popover listbox. | The platform already implements keyboard navigation, type-ahead, screen-reader announcement and — the one that matters most for a back-office used on phones — the native wheel picker. This project has no popover primitive (§15, 0.3 keeps the dependency list short), so a custom listbox would have meant owning focus management and ARIA for a field that did not need it. The search input carries no `name`, so it filters and nothing else; with JavaScript off the select still works. |
| 18.3 | **The filter matches the code and the name in BOTH locales.** | Found in the browser, not by reading: on the Arabic UI, typing "saudi" on a Latin keyboard matched nothing at all. Half this product's admins type Latin and half type Arabic, often on the same machine. A country is one thing with two names, so both find it. |
| 18.4 | **The selected country is pinned to the top of the filtered list and never filtered away.** | A `<select>` whose selected option disappears silently changes its own value — the form would submit a country nobody picked. Verified: filtering to a query matching nothing leaves the value untouched and shows a "no results" line. |
| 18.5 | **`isCountryCode` now guards all five country schemas server-side.** | The picker only offers real codes, but a form field is a suggestion and a POST body is not (§12). |
| 18.6 | **The hotel's location is ENTERED as a map link; `latitude`/`longitude` are DERIVED from it and still stored.** | The client asked for a link instead of coordinates, and typing two seven-decimal numbers is a transcription task with no feedback — a dropped digit in the longitude puts the hotel in the wrong governorate and nothing on screen says so. But a link is a string and coordinates are data: a map pin, a distance sort or a "hotels near the airport" search all need numbers and none can get them back out of a shortened URL later. So the *input* changed and nothing was thrown away; no existing hotel lost its position. |
| 18.7 | **The parser prefers the PLACE PIN (`!3d…!4d…`) over the viewport centre (`@lat,lng`).** | They are different points in the same URL. `@` is wherever the map happened to be centred when the link was copied; `!3d!4d` is the pin itself. Verified end to end: a link carrying both stored the pin. |
| 18.8 | **A shortened link is reported as carrying no coordinates rather than resolved.** | `maps.app.goo.gl/…` is an opaque redirect — following it would mean an outbound HTTP request from the server, on every form submission, to a URL a user supplied. That is a request-forgery surface bought for a convenience. The field says so and asks for the full link instead, which is honest rather than silently saving a hotel with no position (§2.3). |
| 18.9 | **Only `http(s)` links are stored.** | An admin-entered `javascript:` URL that another admin later clicks is stored XSS (§12). Enforced in the Zod schema, in a CHECK on the column, and in the field's own readout. |

**The readout under the field is the point of the change**, not decoration: a
pasted link either resolves to coordinates — shown, with a link to open them in
Maps so the admin can check the pin is the right building — or it does not, and
it says which of the two reasons applies. The old numeric fields gave no
feedback at all, so a wrong digit looked exactly like a right one.

**Bundle cost, stated because §11 asks for it:** the country data adds ~16KB
gzipped to one shared chunk, used by all six forms. Measured on the built
output rather than estimated.

**Two stale message keys were deleted** rather than left behind:
`auth.fields.countryCodeHint` ("a two-letter code") and `hotels.fields.latitude`
/ `.longitude`. Copy that nothing renders is copy that misleads the next person
who greps for it.

### Password reset — fixed 2026-09-08

The recovery link in the email opened on "رابط غير صالح" / "This link is not valid". The link was never
the problem: `/api/auth/confirm` was throwing it away.

Supabase's default email template renders `{{ .ConfirmationURL }}`, which points
at Supabase's own `/auth/v1/verify`. That endpoint consumes the token itself and
then redirects to our `redirect_to` — and because `@supabase/ssr` requests PKCE,
it arrives as **`?code=`**, not `?token_hash=`. The route read only `token_hash`,
found none, and answered `auth-error?reason=invalid` before doing any work.

Confirmed against the client's own attempt rather than by reading code: their
`auth.flow_state` row for `recovery` shows `auth_code_issued_at` ten seconds
after it was created — Supabase issued the code, the route discarded it.

| # | Decision | Rationale |
|---|---|---|
| 8.1 | **`/api/auth/confirm` handles every shape the server can see**: `?code=` via `exchangeCodeForSession`, `?token_hash=&type=` via `verifyOtp`, and Supabase's own `?error=&error_code=` params. | A single landing route that understands one of three shapes is not a landing route. Which shape arrives is decided by an email template in the dashboard, i.e. outside this repo — so the route must not depend on which one is configured. |
| 8.2 | **The implicit flow's `#access_token=…` is deliberately NOT handled.** | A fragment never reaches the server, so a Route Handler cannot see it — handling it would mean shipping a client-side token reader, a second auth surface, for a shape nothing in this app issues (only an admin-generated link produces it). It falls through to the error page instead. Stated here so a later session does not read the omission as an oversight. |
| 8.3 | **Session cookies are applied to the redirect explicitly**, via a new `createRouteHandlerClient()` in `shared/lib/supabase/server.ts`. | `createClient()` writes through `next/headers`, which a Route Handler's self-built redirect does not reliably carry. Establishing a session and sending the user onward must not be able to come apart, or the user lands on the reset page signed out and is told the link expired. |
| 8.4 | **A verifier mismatch reports `wrongBrowser`, not `expired`.** | PKCE binds the link to the browser that requested it. Opening the email on a phone after requesting on a desktop fails with a live, valid link — telling that user it "expired" is false (§2.3) and sends them to request another that fails identically. Verified in the wild: a real `?code=` hit the route during this fix and failed exactly this way. |
| 8.5 | **`next dev`'s `agentRules` is turned off in `next.config.ts`.** | Next.js 16 appends a block of its own instructions to `CLAUDE.md` on every dev boot. That file is this project's working agreement (§14), written by hand and reviewed line by line; a build tool editing it dirties the tree on every start and puts unreviewed text into the spec. |

**Not self-verified, and why:** every branch above was exercised end to end against
the running app — the `token_hash` path through to the reset page rendering with a
real session, and each failure shape — except one: a *valid* `?code=` exchanging
successfully. Reproducing that faithfully needs the live recovery token from
`auth.users`, and reading an auth credential out of the database was refused. The
branch is reached and its failure modes are proven; the success path rests on
`exchangeCodeForSession` behaving as documented, over the same cookie plumbing the
`token_hash` path already proves.

**Follow-up the same day: the email stopped arriving at all.** A separate bug, and
a worse one. The auth logs tell it exactly: `/recover` succeeded once at 23:24:15
and `mail.send` fired, then returned **429** twice — first the per-address cooldown,
then `over_email_send_rate_limit`, the hourly cap on Supabase's built-in SMTP. No
message was sent after the first.

`requestPasswordResetAction` discarded the result of `resetPasswordForEmail`
entirely and returned `{ ok: true, "we sent you a link" }` regardless. So the
provider refused to send and the screen said it had sent — the user was left
watching an inbox for a message that was never going to arrive, with nothing
anywhere to tell them why. `registerAction` had already been taught this
distinction (§15, 4.x); the reset action never was.

| # | Decision | Rationale |
|---|---|---|
| 8.6 | **A 429 from `resetPasswordForEmail` is now surfaced**: `over_email_send_rate_limit` -> "our email service is at its limit", any other 429 -> "too many attempts". Every other error still returns the neutral success. | The neutral response exists to stop the form being used as an account enumerator, and that reasoning holds for errors that could differ between a real and an unknown address. A 429 is not one of those — it is our own capacity and is identical for every caller — so reporting it leaks nothing and is simply true. A screen claiming to have sent an email the provider rejected is exactly the fake success §2.3 forbids. |
| 8.7 | **Custom SMTP is escalated from a Phase 10 item to a live blocker.** | It was recorded as mandatory-before-launch. It is now breaking a shipped flow in development: the built-in SMTP's few-per-hour cap is reached by ordinary testing, and password reset is unusable until it resets. Until a provider is configured, expect this message during any session with more than a couple of email sends. |

Verified in the browser in both locales with the cap genuinely exhausted: the form
now shows the email-service message instead of a false confirmation, and the server
log names the cause and the fix.

**Third configuration item for the client (with SMTP and leaked-password protection).**
Switch the Auth email templates from `{{ .ConfirmationURL }}` to the token-hash form,
in Authentication -> Emails -> Templates:

```
{{ .SiteURL }}/api/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/ar/reset-password
```

(`type=signup` and `next=/ar/pending` for the confirmation template.) This is the
path proven in testing, and it is **stateless** — no cookie from the requesting
browser — so a reset requested on a desktop can be completed on a phone, which
the current PKCE link cannot do. The cost is that `next` is fixed to one locale in
a static template, so an English-locale user lands on the Arabic reset page and
must switch; the code keeps working with either template, so this is the client's
call, not a blocker.

**Known gaps deliberately left open at the end of Phase 0:**
- ~~`POST /api/media/signature` is unauthenticated~~ — **closed in Phase 1**: it now requires an active session and is rate-limited per user id.
- `src/shared/lib/rate-limit.ts` is in-memory and per-instance. Adequate for now; Phase 10 replaces it with a shared store.
- ~~`src/shared/types/database.ts` is a placeholder~~ — **closed in Phase 1**: generated from the live schema via `npm run db:types`.
- `/[locale]/ui-kit` is an internal verification page and should be excluded from the production build in Phase 10.
- ~~The Supabase CLI one-time setup has not been done~~ — **done**: the repo is linked to project `yngfurepjssbssrrbgkb` and all Phase 1 migrations were applied with `supabase db push`.
