import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden } from "next/navigation";
import type { Locale } from "@/shared/i18n/config";
import { can } from "@/modules/auth/domain/user";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import {
  listTransferRates,
  listTransferRoutes,
  listVehicleTypes,
} from "@/modules/transfers/infrastructure/transfers.repository";
import { TransferInventory } from "@/modules/transfers/presentation/transfer-inventory";

/** Transfer inventory (CLAUDE.md §13, Phase 8a). */
export default async function AdminTransfersPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user || !can(user, "transfers.manage")) forbidden();

  const t = await getTranslations("transfers");
  const [vehicles, routes, rates] = await Promise.all([
    listVehicleTypes(),
    listTransferRoutes(),
    listTransferRates(),
  ]);

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("adminTitle")}</h1>
        <p className="max-w-prose text-sm text-ink-muted">{t("adminDescription")}</p>
      </div>

      <TransferInventory
        vehicles={vehicles}
        routes={routes}
        rates={rates}
        locale={locale}
        defaultCurrency="EGP"
      />
    </main>
  );
}
