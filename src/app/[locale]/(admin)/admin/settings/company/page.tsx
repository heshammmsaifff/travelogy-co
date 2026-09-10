import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden } from "next/navigation";
import type { Locale } from "@/shared/i18n/config";
import { Card, CardBody } from "@/shared/ui/card";
import { can } from "@/modules/auth/domain/user";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { getCompanyProfile } from "@/modules/finance/infrastructure/finance.repository";
import { CompanyProfileForm } from "@/modules/finance/presentation/company-profile-form";

/** The issuing company's own details (CLAUDE.md §13, Phase 5c). */
export default async function CompanySettingsPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user || !can(user, "finance.settings.manage")) forbidden();

  const t = await getTranslations("companyProfile");
  const profile = await getCompanyProfile();

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("title")}</h1>
        <p className="max-w-prose text-sm text-ink-muted">{t("description")}</p>
      </div>

      <Card>
        <CardBody>
          <CompanyProfileForm profile={profile} />
        </CardBody>
      </Card>
    </main>
  );
}
