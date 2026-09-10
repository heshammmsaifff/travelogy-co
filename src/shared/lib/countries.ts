import countries from "i18n-iso-countries";
import ar from "i18n-iso-countries/langs/ar.json";
import en from "i18n-iso-countries/langs/en.json";

import type { Locale } from "@/shared/i18n/config";

/**
 * The ISO 3166-1 country list, localised.
 *
 * From `i18n-iso-countries` rather than a hand-written list: a typed-in
 * two-letter code is a field every user gets wrong occasionally ("UK" for GB,
 * "UAE" for AE), and a list maintained here would go stale the next time a
 * country is renamed. The package carries the official ISO names in both of
 * this project's locales, which is the reason it was chosen over
 * `world-countries` or `countries-list` — neither ships Arabic (§5).
 *
 * Deliberately NOT `server-only`: the picker is a client component, and the
 * cost is small — the two language files are 8KB each raw, so this adds a few
 * kilobytes gzipped to the one shared chunk that every country field uses
 * (§11, bundle discipline).
 */

countries.registerLocale(en);
countries.registerLocale(ar);

export type Country = {
  code: string;
  /** The name to display, in the caller's locale. */
  name: string;
  /**
   * Lower-cased haystack for the picker's filter: the code plus the name in
   * BOTH locales.
   *
   * Matching only the displayed name looks right and fails in practice —
   * verified in the browser: on the Arabic UI, typing "saudi" on a Latin
   * keyboard matched nothing at all, and half this product's admins type
   * Latin. A country is one thing with two names, so both find it.
   */
  search: string;
};

/**
 * Every country, sorted by its name in the caller's locale.
 *
 * Sorting is `Intl.Collator`'s job: Arabic does not sort by the Latin
 * alphabet, and `Array.sort()` on strings would put the list in an order an
 * Arabic reader cannot scan (§5 — locale-formatted, not hand-rolled).
 */
export function getCountries(locale: Locale): Country[] {
  const names = countries.getNames(locale, { select: "official" });
  const arNames = countries.getNames("ar", { select: "official" });
  const enNames = countries.getNames("en", { select: "official" });
  const collator = new Intl.Collator(locale);

  return Object.entries(names)
    .map(([code, name]) => ({
      code,
      name,
      search: [code, arNames[code], enNames[code]]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    }))
    .sort((a, b) => collator.compare(a.name, b.name));
}

/** The localised name for one code, or the code itself if it is unknown. */
export function countryName(code: string | null | undefined, locale: Locale): string {
  if (!code) return "";
  return countries.getName(code, locale, { select: "official" }) ?? code;
}

/** Whether a string is a real ISO 3166-1 alpha-2 code. */
export function isCountryCode(code: string): boolean {
  return countries.isValid(code);
}
