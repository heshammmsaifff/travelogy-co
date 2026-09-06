import type { routing } from "./routing";

export type Locale = (typeof routing)["locales"][number];

type LocaleMeta = {
  /** Writing direction applied to <html dir>. */
  dir: "rtl" | "ltr";
  /** Name of the language, written in that language (for the locale switcher). */
  nativeName: string;
  /**
   * BCP-47 tag handed to Intl.NumberFormat / Intl.DateTimeFormat.
   *
   * `ar-EG` carries `-u-nu-latn` deliberately. Left alone, Egyptian Arabic
   * formats digits as Arabic-Indic (١٨٤٥٠), which would sit inconsistently
   * beside the Latin-digit booking references, invoice numbers and credit
   * figures agents work from. Forcing Latin digits keeps every number on a
   * screen reading the same way.
   *
   * DECISION TO CONFIRM: if the client prefers Arabic-Indic numerals in the
   * Arabic UI, drop the `-u-nu-latn` extension here — it is the only change
   * needed, since all formatting flows through shared/lib/format.ts.
   */
  intlTag: string;
};

/**
 * Per-locale presentation metadata. Kept beside the routing config so adding a
 * third locale later is a single edit in two adjacent files.
 */
export const LOCALE_META = {
  ar: { dir: "rtl", nativeName: "العربية", intlTag: "ar-EG-u-nu-latn" },
  en: { dir: "ltr", nativeName: "English", intlTag: "en-GB" },
} as const satisfies Record<Locale, LocaleMeta>;

export function getLocaleDir(locale: Locale): "rtl" | "ltr" {
  return LOCALE_META[locale].dir;
}

/**
 * Narrows an unvalidated route segment to a Locale.
 *
 * Needed because the proxy's matcher skips any path containing a dot, so a
 * request for `/favicon.ico` or `/robots.txt` reaches the `[locale]` route with
 * `locale = "favicon.ico"`. The root layout calls notFound() for that, but a
 * page renders concurrently with its layout — so a page that indexes
 * LOCALE_META directly crashes before the 404 takes effect.
 *
 * Any page that reads LOCALE_META should go through this.
 */
export function isLocale(value: string): value is Locale {
  return value === "ar" || value === "en";
}
