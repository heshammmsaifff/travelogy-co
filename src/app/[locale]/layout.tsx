import { Suspense } from "react";
import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Toaster } from "sileo";
import { LOCALE_META } from "@/shared/i18n/config";
import { routing } from "@/shared/i18n/routing";
import { NavigationSplash } from "@/shared/ui/navigation-splash";
import "@/app/globals.css";

/**
 * Root layout.
 *
 * There is deliberately no `src/app/layout.tsx`: `[locale]` is the only
 * top-level segment, so this file *is* the root layout and owns <html>. That is
 * what lets `lang` and `dir` be set from the resolved locale on the server, with
 * no flash of the wrong direction (CLAUDE.md §5).
 */

const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-arabic",
  display: "swap",
});

/** Pre-renders both locales at build time instead of on first request. */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "app" });

  return {
    title: { default: t("name"), template: `%s · ${t("name")}` },
    description: t("tagline"),
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // A locale outside the configured set is a 404, not a silent fallback.
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Required for static rendering: tells next-intl which locale this render is
  // for, since there is no request to infer it from.
  setRequestLocale(locale);

  const { dir } = LOCALE_META[locale];

  return (
    <html lang={locale} dir={dir} className={plexArabic.variable} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <NextIntlClientProvider>
          <Suspense fallback={null}>
            <NavigationSplash />
          </Suspense>
          {children}
          {/* Mounted once for the whole app (CLAUDE.md §3). Position is given in
              logical terms so toasts appear on the reading-start edge in both
              directions: top-left under RTL, top-right under LTR. */}
          <Toaster position={dir === "rtl" ? "top-left" : "top-right"} theme="light" />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
