import { getTranslations, setRequestLocale } from "next-intl/server";
import { LuArrowLeft, LuArrowRight } from "react-icons/lu";
import { Link } from "@/shared/i18n/navigation";
import { LOCALE_META, type Locale } from "@/shared/i18n/config";
import { Button } from "@/shared/ui/button";
import { LocaleSwitcher } from "@/shared/ui/locale-switcher";

/**
 * Placeholder home page for the (public) marketing site.
 *
 * The real bilingual marketing pages (home, about, privacy, terms) are Phase 4
 * (CLAUDE.md §13). This page exists so Phase 0's foundation — locale routing,
 * direction switching, fonts, tokens and primitives — is visibly working.
 */
export default async function HomePage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
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
