import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden } from "next/navigation";
import type { Locale } from "@/shared/i18n/config";
import { can } from "@/modules/auth/domain/user";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { listVehicleTypes } from "@/modules/transfers/infrastructure/transfers.repository";
import { listDrivers } from "@/modules/driver-ops/infrastructure/drivers.repository";
import { DriverManager } from "@/modules/driver-ops/presentation/driver-manager";

/** The driver directory (CLAUDE.md §13, Phase 8b). */
export default async function AdminDriversPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user || !can(user, "drivers.manage")) forbidden();

  const t = await getTranslations("drivers");
  const [drivers, vehicles] = await Promise.all([listDrivers(), listVehicleTypes()]);

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("title")}</h1>
        <p className="max-w-prose text-sm text-ink-muted">{t("description")}</p>
      </div>

      <DriverManager
        drivers={drivers}
        vehicleTypes={vehicles.map((v) => ({
          id: v.id,
          name: locale === "ar" ? v.nameAr : v.nameEn,
        }))}
        locale={locale}
      />
    </main>
  );
}
