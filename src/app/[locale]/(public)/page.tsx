import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { LuArrowLeft, LuArrowRight } from "react-icons/lu";
import { Link } from "@/shared/i18n/navigation";
import { isLocale, LOCALE_META } from "@/shared/i18n/config";
import { Button } from "@/shared/ui/button";
import { LocaleSwitcher } from "@/shared/ui/locale-switcher";

/**
 * Placeholder home page for the (public) marketing site.
 *
 * The real bilingual marketing pages (home, about, privacy, terms) are Phase 4
 * (CLAUDE.md §13). This page exists so Phase 0's foundation — locale routing,
 * direction switching, fonts, tokens and primitives — is visibly working.
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  // A page renders concurrently with its layout, so the layout's notFound()
  // does not protect this from `/favicon.ico` arriving as a "locale".
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations();
  const { dir } = LOCALE_META[locale];
  // Arrow direction is content, not decoration — it must mirror with the locale.
  const ArrowIcon = dir === "rtl" ? LuArrowLeft : LuArrowRight;

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-start justify-center gap-6 px-6 py-16">
      <LocaleSwitcher current={locale} label={t("common.language")} />

      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">{t("app.name")}</h1>
        <p className="text-lg text-ink-muted">{t("app.tagline")}</p>
      </div>

      <Button asChild size="lg">
        <Link href="/ui-kit">
          {t("devKitchenSink.title")}
          <ArrowIcon aria-hidden />
        </Link>
      </Button>
    </main>
  );
}
