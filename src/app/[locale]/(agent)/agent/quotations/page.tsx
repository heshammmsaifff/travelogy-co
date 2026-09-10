import { getTranslations, setRequestLocale } from "next-intl/server";
import { LuFileText, LuSearch } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { Link } from "@/shared/i18n/navigation";
import { formatCurrency, formatDate, formatNumber } from "@/shared/lib/format";
import { Badge } from "@/shared/ui/badge";
import { buttonVariants } from "@/shared/ui/button-variants";
import { Card, CardBody } from "@/shared/ui/card";
import {
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableShell,
} from "@/shared/ui/table";
import { listQuotations } from "@/modules/bookings/infrastructure/quotations.repository";

/**
 * Saved quotations for the agent's company (CLAUDE.md §13, Phase 4).
 *
 * A Server Component: the list is a read, and RLS scopes it to the caller's
 * agency, so no client JavaScript is needed to render it (§11).
 */
export default async function QuotationsPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("quotations");
  const quotations = await listQuotations();

  const tone = {
    draft: "neutral",
    sent: "brand",
    accepted: "success",
    expired: "warning",
  } as const;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("title")}</h1>
          <p className="max-w-prose text-sm text-ink-muted">{t("description")}</p>
        </div>
        <Link href="/agent/search" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          <LuSearch aria-hidden />
          {t("emptyCta")}
        </Link>
      </div>

      {quotations.length === 0 ? (
        <Card>
          <CardBody className="flex flex-col items-center gap-4 py-14 text-center">
            <LuFileText className="size-8 text-ink-subtle" aria-hidden />
            <p className="max-w-md text-sm text-ink-muted">{t("empty")}</p>
            <Link href="/agent/search" className={buttonVariants({ size: "sm" })}>
              {t("emptyCta")}
            </Link>
          </CardBody>
        </Card>
      ) : (
        <TableShell>
          <TableHead>
            <TableHeaderCell>{t("reference")}</TableHeaderCell>
            <TableHeaderCell>{t("titleField")}</TableHeaderCell>
            <TableHeaderCell>{t("stay")}</TableHeaderCell>
            <TableHeaderCell>{t("items")}</TableHeaderCell>
            <TableHeaderCell>{t("total")}</TableHeaderCell>
            <TableHeaderCell>{t("statusLabel")}</TableHeaderCell>
          </TableHead>
          <TableBody>
            {quotations.length === 0 ? (
              <TableEmpty colSpan={6}>{t("empty")}</TableEmpty>
            ) : (
              quotations.map((q) => (
                <TableRow key={q.id}>
                  <TableCell>
                    <Link
                      href={`/agent/quotations/${q.id}`}
                      className="font-mono text-xs font-medium text-brand-700 hover:underline"
                      dir="ltr"
                    >
                      {q.reference}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="block text-sm text-ink">{q.title ?? "—"}</span>
                    {q.guestName ? (
                      <span className="block text-xs text-ink-muted">{q.guestName}</span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <span className="whitespace-nowrap text-xs text-ink-muted" dir="ltr">
                      {formatDate(q.checkIn, locale)} → {formatDate(q.checkOut, locale)}
                    </span>
                  </TableCell>
                  <TableCell>{formatNumber(q.itemCount, locale)}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatCurrency(q.total, locale, q.currencyCode)}
                  </TableCell>
                  <TableCell>
                    <Badge tone={tone[q.status]}>{t(`status.${q.status}`)}</Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </TableShell>
      )}
    </main>
  );
}
