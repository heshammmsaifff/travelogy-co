import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden } from "next/navigation";
import type { Locale } from "@/shared/i18n/config";
import { can } from "@/modules/auth/domain/user";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { listTaxRates } from "@/modules/finance/infrastructure/finance.repository";
import { TaxManager } from "@/modules/finance/presentation/tax-manager";

/** Tax rate settings (CLAUDE.md §13, Phase 5b). */
export default async function TaxSettingsPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user || !can(user, "finance.settings.manage")) forbidden();

  const t = await getTranslations("tax");
  const rates = await listTaxRates();

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("title")}</h1>
        <p className="max-w-prose text-sm text-ink-muted">{t("description")}</p>
      </div>

      <TaxManager rates={rates} locale={locale} />
    </main>
  );
}
