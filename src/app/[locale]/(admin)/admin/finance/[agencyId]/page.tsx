import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden, notFound } from "next/navigation";
import { LuArrowLeft, LuArrowRight } from "react-icons/lu";
import { LOCALE_META, type Locale } from "@/shared/i18n/config";
import { Link } from "@/shared/i18n/navigation";
import { can } from "@/modules/auth/domain/user";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import {
  getReceivables,
  getStatement,
} from "@/modules/finance/infrastructure/finance.repository";
import {
  CreditPositionCards,
  StatementTable,
} from "@/modules/finance/presentation/statement-view";
import { RecordPaymentButton } from "@/modules/finance/presentation/record-payment-button";

/** One agency's statement, as the back-office sees it (CLAUDE.md §13, Phase 5b). */
export default async function AdminAgencyStatementPage({
  params,
}: {
  params: Promise<{ locale: Locale; agencyId: string }>;
}) {
  const { locale, agencyId } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user || !can(user, "finance.statements.view")) forbidden();

  const t = await getTranslations("finance");
  const [receivables, entries] = await Promise.all([getReceivables(), getStatement(agencyId)]);
  const row = receivables.find((r) => r.agencyId === agencyId);
  if (!row) notFound();

  const { dir } = LOCALE_META[locale];
  const Back = dir === "rtl" ? LuArrowRight : LuArrowLeft;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <Link
        href="/admin/finance"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <Back className="size-4" aria-hidden />
        {t("backToFinance")}
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-mono text-xs text-ink-muted" dir="ltr">
            {row.agencyCode}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{row.agencyName}</h1>
          <p className="text-sm text-ink-muted">{t("statementDescription")}</p>
        </div>
        {can(user, "finance.payments.record") ? (
          <RecordPaymentButton agencyId={row.agencyId} agencyName={row.agencyName} today={today} />
        ) : null}
      </div>

      <CreditPositionCards position={row} locale={locale} />
      <StatementTable entries={entries} locale={locale} />
    </main>
  );
}
