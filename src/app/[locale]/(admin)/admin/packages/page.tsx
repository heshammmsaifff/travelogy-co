import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden } from "next/navigation";
import type { Locale } from "@/shared/i18n/config";
import { can } from "@/modules/auth/domain/user";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { listPackages } from "@/modules/packages/infrastructure/packages.repository";
import { PackageList } from "@/modules/packages/presentation/package-list";

/** The package catalogue (CLAUDE.md §13, Phase 8c). */
export default async function AdminPackagesPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user || !can(user, "packages.manage")) forbidden();

  const t = await getTranslations("packages");
  const packages = await listPackages();

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("title")}</h1>
        <p className="max-w-prose text-sm text-ink-muted">{t("description")}</p>
      </div>

      <PackageList packages={packages} locale={locale} />
    </main>
  );
}
