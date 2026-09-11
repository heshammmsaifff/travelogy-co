import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden, notFound } from "next/navigation";
import { LuChevronLeft, LuChevronRight } from "react-icons/lu";
import { isLocale } from "@/shared/i18n/config";
import { Link } from "@/shared/i18n/navigation";
import { can } from "@/modules/auth/domain/user";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { StaticRatesUploader } from "@/modules/hotels/presentation/static-rates-uploader";

/**
 * Admin Static Rates & Contract Ingestion Page.
 * Allows operations managers and admins to upload contracted rates
 * via Excel (.xlsx, .xls) or CSV with automated validation and mapping.
 */
export default async function StaticRatesUploadPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!can(user, "hotels.rates.update")) forbidden();

  const t = await getTranslations("staticRates");
  const tHotels = await getTranslations("hotels");
  const BackIcon = locale === "ar" ? LuChevronRight : LuChevronLeft;

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-2">
        <Link
          href="/admin/hotels"
          className="inline-flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-ink hover:underline"
        >
          <BackIcon className="size-4" aria-hidden />
          <span>{tHotels("backToList")}</span>
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("title")}</h1>
        <p className="max-w-prose text-sm text-ink-muted">{t("description")}</p>
      </div>

      <StaticRatesUploader locale={locale} />
    </main>
  );
}
