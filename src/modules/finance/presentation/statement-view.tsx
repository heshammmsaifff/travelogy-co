import { getTranslations } from "next-intl/server";
import { LuReceipt } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { formatCurrency, formatDate } from "@/shared/lib/format";
import { Badge } from "@/shared/ui/badge";
import { Card, CardBody } from "@/shared/ui/card";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableShell,
} from "@/shared/ui/table";
import type {
  CreditPosition,
  StatementEntry,
} from "@/modules/finance/infrastructure/finance.repository";

/**
 * The statement of account, shared by the agent's own view and the
 * back-office's per-agency view (CLAUDE.md §13, Phase 5b).
 *
 * The running balance comes from the database with the rows; recomputing it
 * here would be a second answer to a question §10 says has exactly one.
 */

const TONE = { booking: "warning", payment: "success", refund: "danger" } as const;

export async function CreditPositionCards({
  position,
  locale,
}: {
  position: CreditPosition;
  locale: Locale;
}) {
  const t = await getTranslations("finance");
  const money = (n: number) => formatCurrency(n, locale, position.currencyCode);

  const cells = [
    { key: "creditLimit", value: money(position.creditLimit), tone: "text-ink" },
    { key: "outstanding", value: money(position.outstanding), tone: "text-ink" },
    { key: "paid", value: money(position.paid), tone: "text-success-700" },
    { key: "balance", value: money(position.balance), tone: "text-ink" },
    { key: "available", value: money(position.available), tone: "text-brand-700" },
  ] as const;

  return (
    <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cells.map(({ key, value, tone }) => (
        <div key={key} className="rounded-card border border-border bg-surface px-4 py-3">
          <dt className="text-xs text-ink-muted">{t(key)}</dt>
          <dd className={`text-lg font-semibold tabular-nums ${tone}`}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export async function StatementTable({
  entries,
  locale,
}: {
  entries: StatementEntry[];
  locale: Locale;
}) {
  const t = await getTranslations("finance");

  if (entries.length === 0) {
    return (
      <Card>
        <CardBody className="flex flex-col items-center gap-3 py-14 text-center">
          <LuReceipt className="size-8 text-ink-subtle" aria-hidden />
          <p className="max-w-md text-sm text-ink-muted">{t("emptyStatement")}</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <TableShell>
      <TableHead>
        <TableHeaderCell>{t("date")}</TableHeaderCell>
        <TableHeaderCell>{t("type")}</TableHeaderCell>
        <TableHeaderCell>{t("reference")}</TableHeaderCell>
        <TableHeaderCell>{t("detail")}</TableHeaderCell>
        <TableHeaderCell>{t("debit")}</TableHeaderCell>
        <TableHeaderCell>{t("credit")}</TableHeaderCell>
        <TableHeaderCell>{t("runningBalance")}</TableHeaderCell>
      </TableHead>
      <TableBody>
        {entries.map((e) => (
          <TableRow key={`${e.entryType}-${e.reference}`}>
            <TableCell>
              <span className="whitespace-nowrap text-xs text-ink-muted" dir="ltr">
                {formatDate(e.entryDate, locale)}
              </span>
            </TableCell>
            <TableCell>
              <Badge tone={TONE[e.entryType]}>{t(`entryType.${e.entryType}`)}</Badge>
            </TableCell>
            <TableCell>
              <span className="font-mono text-xs" dir="ltr">
                {e.reference}
              </span>
            </TableCell>
            <TableCell>{e.description}</TableCell>
            <TableCell className="tabular-nums">
              {e.debit > 0 ? formatCurrency(e.debit, locale, e.currencyCode) : "—"}
            </TableCell>
            <TableCell className="tabular-nums text-success-700">
              {e.credit > 0 ? formatCurrency(e.credit, locale, e.currencyCode) : "—"}
            </TableCell>
            <TableCell className="font-medium tabular-nums">
              {formatCurrency(e.runningBalance, locale, e.currencyCode)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </TableShell>
  );
}
