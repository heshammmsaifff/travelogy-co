import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

/**
 * Resolves the message catalogue and Intl formatting defaults for each request.
 * Wired into Next via createNextIntlPlugin in next.config.ts.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../../messages/${locale}.json`)).default,
    // CLAUDE.md §5: dates/numbers/currency are Intl-formatted, never hand-built.
    formats: {
      dateTime: {
        short: { day: "2-digit", month: "short", year: "numeric" },
        long: { dateStyle: "long", timeStyle: "short" },
      },
      number: {
        currency: { style: "currency", currency: "EGP", maximumFractionDigits: 2 },
      },
    },
    timeZone: "Africa/Cairo",
    getMessageFallback({ key }) {
      // Loud in development so a missing string is obvious on screen; quiet in
      // production so a gap degrades to the last key segment rather than a crash.
      return process.env.NODE_ENV === "development" ? `⟨${key}⟩` : (key.split(".").pop() ?? key);
    },
  };
});
