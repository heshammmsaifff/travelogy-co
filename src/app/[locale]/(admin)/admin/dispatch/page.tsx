import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden } from "next/navigation";
import type { Locale } from "@/shared/i18n/config";
import { Input } from "@/shared/ui/input";
import { can } from "@/modules/auth/domain/user";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import {
  getDispatchBoard,
  listDrivers,
} from "@/modules/driver-ops/infrastructure/drivers.repository";
import { DispatchBoard } from "@/modules/driver-ops/presentation/dispatch-board";

/**
 * The dispatch board (CLAUDE.md §13, Phase 8b).
 *
 * The date is in the URL rather than component state, as every other filter in
 * this project is (§15, 3.9): a dispatcher sends "look at tomorrow" to a
 * colleague as a link, and a refresh keeps the day they were working on.
 */
export default async function AdminDispatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user || !can(user, "dispatch.manage")) forbidden();

  const t = await getTranslations("drivers");
  const tCommon = await getTranslations("common");
  const sp = await searchParams;

  const today = new Date().toISOString().slice(0, 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? (sp.date as string) : today;

  const [rows, drivers] = await Promise.all([getDispatchBoard(date, locale), listDrivers()]);

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("dispatchTitle")}</h1>
        <p className="max-w-prose text-sm text-ink-muted">{t("dispatchDescription")}</p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <Input
          name="date"
          type="date"
          dir="ltr"
          defaultValue={date}
          label={t("fields.date")}
          className="w-auto"
        />
        <button
          type="submit"
          className="h-9 cursor-pointer rounded-control bg-brand-600 px-4 text-sm font-medium text-ink-inverse transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {tCommon("search")}
        </button>
      </form>

      <DispatchBoard
        rows={rows}
        // Only active drivers can be given work — `assign_driver` refuses an
        // inactive one, so offering them would be offering a refusal.
        drivers={drivers
          .filter((d) => d.isActive)
          .map((d) => ({ id: d.id, name: d.fullName, code: d.code }))}
        locale={locale}
      />
    </main>
  );
}
