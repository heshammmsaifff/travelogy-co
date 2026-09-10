import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden, notFound } from "next/navigation";
import { LuArrowLeft, LuArrowRight } from "react-icons/lu";
import { LOCALE_META, type Locale } from "@/shared/i18n/config";
import { Link } from "@/shared/i18n/navigation";
import { Badge } from "@/shared/ui/badge";
import { can } from "@/modules/auth/domain/user";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import {
  getPackage,
  listPackageDays,
  listPackageDepartures,
  listPackageRates,
} from "@/modules/packages/infrastructure/packages.repository";
import { PackageEditor } from "@/modules/packages/presentation/package-editor";

/** One tour: details, itinerary, rates and departures (CLAUDE.md §13, Phase 8c). */
export default async function AdminPackagePage({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user || !can(user, "packages.manage")) forbidden();

  const pkg = await getPackage(id);
  if (!pkg) notFound();

  const t = await getTranslations("packages");
  const [days, rates, departures] = await Promise.all([
    listPackageDays(id),
    listPackageRates(id),
    listPackageDepartures(id),
  ]);

  const { dir } = LOCALE_META[locale];
  const Back = dir === "rtl" ? LuArrowRight : LuArrowLeft;
  const STATUS_TONE = { draft: "warning", active: "success", archived: "neutral" } as const;

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-2">
        <Link
          href="/admin/packages"
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
        >
          <Back className="size-4" aria-hidden />
          {t("title")}
        </Link>
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight text-ink">
          {locale === "ar" ? pkg.nameAr : pkg.nameEn}
          <Badge tone={STATUS_TONE[pkg.status]}>{t(`status.${pkg.status}`)}</Badge>
        </h1>
      </div>

      <PackageEditor
        pkg={pkg}
        days={days}
        rates={rates}
        departures={departures}
        locale={locale}
        defaultCurrency="EGP"
      />
    </main>
  );
}
