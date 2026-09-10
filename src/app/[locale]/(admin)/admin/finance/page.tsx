import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden } from "next/navigation";
import { LuWallet } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { Link } from "@/shared/i18n/navigation";
import { formatCurrency } from "@/shared/lib/format";
import { Card, CardBody } from "@/shared/ui/card";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableShell,
} from "@/shared/ui/table";
import { can } from "@/modules/auth/domain/user";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { getReceivables } from "@/modules/finance/infrastructure/finance.repository";
import { RecordPaymentButton } from "@/modules/finance/presentation/record-payment-button";

/**
 * The receivables position (CLAUDE.md §13, Phase 5b).
 *
 * `receivables_summary()` orders by balance descending, so whoever owes the
 * most is the first thing on the screen. Every figure is computed in Postgres
 * from the ledger — nothing here adds money up (§10, §11).
 */
export default async function AdminFinancePage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user || !can(user, "finance.statements.view")) forbidden();

  const t = await getTranslations("finance");
  const rows = await getReceivables();
  const canRecord = can(user, "finance.payments.record");
  // Resolved on the server so the default value does not depend on the
  // viewer's clock or time zone.
  const today = new Date().toISOString().slice(0, 10);

  const totalOwed = rows.reduce((sum, r) => sum + r.balance, 0);
  const currency = rows[0]?.currencyCode ?? "EGP";

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("title")}</h1>
          <p className="text-sm text-ink-muted">{t("description")}</p>
        </div>
        {rows.length > 0 ? (
          <div className="rounded-card border border-border bg-surface px-4 py-2 text-end">
            <p className="text-xs text-ink-muted">{t("totalOwed")}</p>
            <p className="text-xl font-semibold text-ink tabular-nums">
              {formatCurrency(totalOwed, locale, currency)}
            </p>
          </div>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardBody className="flex flex-col items-center gap-3 py-14 text-center">
            <LuWallet className="size-8 text-ink-subtle" aria-hidden />
            <p className="text-sm text-ink-muted">{t("noAgencies")}</p>
          </CardBody>
        </Card>
      ) : (
        <TableShell>
          <TableHead>
            <TableHeaderCell>{t("agency")}</TableHeaderCell>
            <TableHeaderCell>{t("creditLimit")}</TableHeaderCell>
            <TableHeaderCell>{t("outstanding")}</TableHeaderCell>
            <TableHeaderCell>{t("paid")}</TableHeaderCell>
            <TableHeaderCell>{t("balance")}</TableHeaderCell>
            <TableHeaderCell>{t("available")}</TableHeaderCell>
            <TableHeaderCell>{""}</TableHeaderCell>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.agencyId}>
                <TableCell>
                  <Link
                    href={`/admin/finance/${r.agencyId}`}
                    className="block text-sm font-medium text-brand-700 hover:underline"
                  >
                    {r.agencyName}
                  </Link>
                  <span className="block font-mono text-2xs text-ink-subtle" dir="ltr">
                    {r.agencyCode}
                  </span>
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatCurrency(r.creditLimit, locale, r.currencyCode)}
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatCurrency(r.outstanding, locale, r.currencyCode)}
                </TableCell>
                <TableCell className="tabular-nums text-success-700">
                  {formatCurrency(r.paid, locale, r.currencyCode)}
                </TableCell>
                <TableCell className="font-medium tabular-nums">
                  {formatCurrency(r.balance, locale, r.currencyCode)}
                </TableCell>
                <TableCell
                  className={
                    "tabular-nums " + (r.available < 0 ? "text-danger-700" : "text-ink-muted")
                  }
                >
                  {formatCurrency(r.available, locale, r.currencyCode)}
                </TableCell>
                <TableCell>
                  {canRecord ? (
                    <RecordPaymentButton
                      agencyId={r.agencyId}
                      agencyName={r.agencyName}
                      today={today}
                    />
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </TableShell>
      )}
    </main>
  );
}
