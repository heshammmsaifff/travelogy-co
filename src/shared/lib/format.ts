import { LOCALE_META, type Locale } from "@/shared/i18n/config";

/**
 * Locale-aware formatting helpers (CLAUDE.md §5: numbers, currency and dates
 * must go through Intl.*, never hand-built strings).
 *
 * Intl.*Format construction is comparatively expensive, so formatters are
 * memoised per (locale, options) pair rather than rebuilt on every render.
 */

const numberFormatters = new Map<string, Intl.NumberFormat>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function numberFormatter(locale: Locale, options: Intl.NumberFormatOptions = {}) {
  const tag = LOCALE_META[locale].intlTag;
  const key = `${tag}:${JSON.stringify(options)}`;
  let formatter = numberFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(tag, options);
    numberFormatters.set(key, formatter);
  }
  return formatter;
}

function dateFormatter(locale: Locale, options: Intl.DateTimeFormatOptions = {}) {
  const tag = LOCALE_META[locale].intlTag;
  const key = `${tag}:${JSON.stringify(options)}`;
  let formatter = dateFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(tag, options);
    dateFormatters.set(key, formatter);
  }
  return formatter;
}

export function formatNumber(value: number, locale: Locale, options?: Intl.NumberFormatOptions) {
  return numberFormatter(locale, options).format(value);
}

/**
 * Currency defaults to EGP, the platform's initial operating currency. The
 * multi-currency model lands in Phase 5 (CLAUDE.md §13) — passing an explicit
 * currency here already works, so no call site needs rewriting then.
 */
export function formatCurrency(value: number, locale: Locale, currency = "EGP") {
  return numberFormatter(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDate(
  value: Date | string,
  locale: Locale,
  options?: Intl.DateTimeFormatOptions,
) {
  const date = typeof value === "string" ? new Date(value) : value;
  return dateFormatter(
    locale,
    options ?? { day: "2-digit", month: "short", year: "numeric" },
  ).format(date);
}

/** Human-readable file size, used by the media pipeline UI. */
export function formatBytes(bytes: number, locale: Locale) {
  const units = ["B", "KB", "MB"] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${formatNumber(value, locale, { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[unit]}`;
}
