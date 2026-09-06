import { defineRouting } from "next-intl/routing";

/**
 * Locale routing for the whole app.
 *
 * CLAUDE.md §5: Arabic is the default locale, English is secondary, and every
 * route is locale-prefixed. `always` prefixing keeps `/ar/...` explicit in the
 * URL rather than letting the default locale sit at the bare root — one shape
 * of URL to reason about in middleware, canonical tags and RLS-free public SSG.
 */
export const routing = defineRouting({
  locales: ["ar", "en"],
  defaultLocale: "ar",
  localePrefix: "always",
});
