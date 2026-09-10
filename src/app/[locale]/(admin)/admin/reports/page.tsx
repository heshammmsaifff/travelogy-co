import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden } from "next/navigation";
import { LuChartNoAxesColumn, LuDownload } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { Link } from "@/shared/i18n/navigation";
import { formatCurrency, formatDate, formatNumber } from "@/shared/lib/format";
import { Badge } from "@/shared/ui/badge";
import { buttonVariants } from "@/shared/ui/button-variants";
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
import {
  getAgentReport,
  getBookingReport,
  getHotelReport,
} from "@/modules/reports/infrastructure/reports.repository";
import { STATUS_TONE } from "@/modules/bookings/presentation/booking-views";

const TABS = ["bookings", "agents", "hotels"] as const;
type Tab = (typeof TABS)[number];
const STATUSES = ["pending", "confirmed", "completed", "cancelled"] as const;

/**
 * Reports (CLAUDE.md §13, Phase 7).
 *
 * A Server Component with its filters in the URL, so a report is shareable and
 * survives a refresh (§15, decision 3.9). Every number arrives already summed
 * by Postgres; nothing here adds anything up.
 */
export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ tab?: string; from?: string; to?: string; status?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;

  const user = await getCurrentUser();
  if (!user || !can(user, "reports.view")) forbidden();

  const t = await getTranslations("reports");
  const tc = await getTranslations("reports.columns");
  const tb = await getTranslations("bookings");

  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "bookings";
  const filters = { from: sp.from, to: sp.to, status: sp.status };
  const money = (n: number, ccy: string) => formatCurrency(n, locale, ccy);

  const query = new URLSearchParams();
  if (sp.from) query.set("from", sp.from);
  if (sp.to) query.set("to", sp.to);
  if (sp.status) query.set("status", sp.status);

  const exportHref = `/api/reports/export?report=${tab}&locale=${locale}${query.size ? `&${query}` : ""}`;

  const [bookings, agents, hotels] = await Promise.all([
    tab === "bookings" ? getBookingReport(locale, filters) : Promise.resolve([]),
    tab === "agents" ? getAgentReport(filters) : Promise.resolve([]),
    tab === "hotels" ? getHotelReport(locale, filters) : Promise.resolve([]),
  ]);

  const rowCount = tab === "bookings" ? bookings.length : tab === "agents" ? agents.length : hotels.length;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("title")}</h1>
        <p className="max-w-prose text-sm text-ink-muted">{t("description")}</p>
      </div>

      <nav aria-label={t("title")}>
        <ul className="flex flex-wrap gap-1">
          {TABS.map((key) => (
            <li key={key}>
              <Link
                href={`/admin/reports?tab=${key}${query.size ? `&${query}` : ""}`}
                aria-current={tab === key ? "page" : undefined}
                className={
                  "rounded-control px-3 py-1.5 text-sm font-medium transition-colors " +
                  (tab === key
                    ? "bg-brand-600 text-ink-inverse"
                    : "text-ink-muted hover:bg-surface-hover hover:text-ink")
                }
              >
                {t(`tabs.${key}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* A GET form: the filters are the URL. */}
      <Card>
        <CardBody>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="tab" value={tab} />
            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-ink">{t("from")}</span>
              <input
                type="date"
                name="from"
                dir="ltr"
                defaultValue={sp.from ?? ""}
                className="h-9 rounded-control border border-border bg-surface px-2.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
              />
            </label>
            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-ink">{t("to")}</span>
              <input
                type="date"
                name="to"
                dir="ltr"
                defaultValue={sp.to ?? ""}
                className="h-9 rounded-control border border-border bg-surface px-2.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
              />
            </label>
            {tab === "bookings" ? (
              <label className="space-y-1.5">
                <span className="block text-xs font-medium text-ink">{t("status")}</span>
                <select
                  name="status"
                  defaultValue={sp.status ?? ""}
                  className="h-9 cursor-pointer rounded-control border border-border bg-surface px-2.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <option value="">{t("allStatuses")}</option>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {tb(`status.${s}`)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <button
              type="submit"
              className="h-9 cursor-pointer rounded-control bg-brand-600 px-4 text-sm font-medium text-ink-inverse transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {t("apply")}
            </button>
            <Link
              href={`/admin/reports?tab=${tab}`}
              className={buttonVariants({ variant: "ghost", size: "md" })}
            >
              {t("reset")}
            </Link>

            {can(user, "reports.export") ? (
              <a
                href={exportHref}
                className={buttonVariants({ variant: "secondary", size: "md", className: "ms-auto" })}
              >
                <LuDownload aria-hidden />
                {t("export")}
              </a>
            ) : null}
          </form>
          {can(user, "reports.export") ? (
            <p className="mt-2 text-xs text-ink-subtle">{t("exportHint")}</p>
          ) : null}
        </CardBody>
      </Card>

      <p className="flex flex-wrap items-center gap-3 text-xs text-ink-muted">
        <span>{t("rowCount", { count: formatNumber(rowCount, locale) })}</span>
        <span>{t("marginNote")}</span>
      </p>

      {rowCount === 0 ? (
        <Card>
          <CardBody className="flex flex-col items-center gap-3 py-14 text-center">
            <LuChartNoAxesColumn className="size-8 text-ink-subtle" aria-hidden />
            <p className="text-sm text-ink-muted">{t("empty")}</p>
          </CardBody>
        </Card>
      ) : tab === "bookings" ? (
        <>
          <TableShell>
            <TableHead>
              <TableHeaderCell>{tc("reference")}</TableHeaderCell>
              <TableHeaderCell>{tc("bookedOn")}</TableHeaderCell>
              <TableHeaderCell>{tc("agency")}</TableHeaderCell>
              <TableHeaderCell>{tc("hotel")}</TableHeaderCell>
              <TableHeaderCell>{tc("roomNights")}</TableHeaderCell>
              <TableHeaderCell>{tc("sell")}</TableHeaderCell>
              <TableHeaderCell>{tc("net")}</TableHeaderCell>
              <TableHeaderCell>{tc("margin")}</TableHeaderCell>
              <TableHeaderCell>{tc("status")}</TableHeaderCell>
            </TableHead>
            <TableBody>
              {bookings.map((r) => (
                <TableRow key={r.reference}>
                  <TableCell>
                    <span className="font-mono text-xs" dir="ltr">
                      {r.reference}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="whitespace-nowrap text-xs text-ink-muted" dir="ltr">
                      {formatDate(r.bookedOn, locale)}
                    </span>
                  </TableCell>
                  <TableCell>{r.agencyName ?? "—"}</TableCell>
                  <TableCell>{r.hotelName ?? "—"}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatNumber(r.roomNights, locale)}
                  </TableCell>
                  <TableCell className="tabular-nums">{money(r.sellTotal, r.currencyCode)}</TableCell>
                  <TableCell className="tabular-nums text-ink-muted">
                    {r.netTotal === null ? "—" : money(r.netTotal, r.currencyCode)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {/* A booking with no recorded cost shows blank, not full
                        profit — see the note below the table. */}
                    {r.margin === null ? (
                      <span className="text-ink-subtle">{t("unknownMargin")}</span>
                    ) : (
                      <span className="font-medium text-success-700">
                        {money(r.margin, r.currencyCode)}
                        <span className="ms-1 text-2xs text-ink-muted">
                          {formatNumber(r.marginPct ?? 0, locale)}%
                        </span>
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE] ?? "neutral"}>
                      {tb(`status.${r.status}`)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </TableShell>
          {bookings.some((r) => r.margin === null) ? (
            <p className="text-xs text-ink-subtle">{t("unknownMarginNote")}</p>
          ) : null}
        </>
      ) : tab === "agents" ? (
        <TableShell>
          <TableHead>
            <TableHeaderCell>{tc("agency")}</TableHeaderCell>
            <TableHeaderCell>{tc("bookingsLive")}</TableHeaderCell>
            <TableHeaderCell>{tc("cancellationPct")}</TableHeaderCell>
            <TableHeaderCell>{tc("roomNights")}</TableHeaderCell>
            <TableHeaderCell>{tc("sell")}</TableHeaderCell>
            <TableHeaderCell>{tc("margin")}</TableHeaderCell>
            <TableHeaderCell>{tc("paid")}</TableHeaderCell>
            <TableHeaderCell>{tc("balance")}</TableHeaderCell>
          </TableHead>
          <TableBody>
            {agents.map((r) => (
              <TableRow key={r.agencyId}>
                <TableCell>
                  <span className="block text-sm text-ink">{r.agencyName}</span>
                  <span className="block font-mono text-2xs text-ink-subtle" dir="ltr">
                    {r.agencyCode}
                  </span>
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatNumber(r.bookingsLive, locale)}
                  {r.bookingsCancelled > 0 ? (
                    <span className="ms-1 text-2xs text-danger-700">
                      +{formatNumber(r.bookingsCancelled, locale)}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatNumber(r.cancellationPct, locale)}%
                </TableCell>
                <TableCell className="tabular-nums">{formatNumber(r.roomNights, locale)}</TableCell>
                <TableCell className="tabular-nums">{money(r.sellTotal, r.currencyCode)}</TableCell>
                <TableCell className="tabular-nums font-medium text-success-700">
                  {money(r.margin, r.currencyCode)}
                  <span className="ms-1 text-2xs text-ink-muted">
                    {formatNumber(r.marginPct, locale)}%
                  </span>
                </TableCell>
                <TableCell className="tabular-nums">{money(r.paidTotal, r.currencyCode)}</TableCell>
                <TableCell className="tabular-nums">{money(r.balance, r.currencyCode)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </TableShell>
      ) : (
        <TableShell>
          <TableHead>
            <TableHeaderCell>{tc("hotel")}</TableHeaderCell>
            <TableHeaderCell>{tc("city")}</TableHeaderCell>
            <TableHeaderCell>{tc("bookingsLive")}</TableHeaderCell>
            <TableHeaderCell>{tc("roomNights")}</TableHeaderCell>
            <TableHeaderCell>{tc("sell")}</TableHeaderCell>
            <TableHeaderCell>{tc("net")}</TableHeaderCell>
            <TableHeaderCell>{tc("margin")}</TableHeaderCell>
          </TableHead>
          <TableBody>
            {hotels.map((r) => (
              <TableRow key={r.hotelId}>
                <TableCell>
                  <span className="block text-sm text-ink">{r.hotelName}</span>
                  <span className="block font-mono text-2xs text-ink-subtle" dir="ltr">
                    {r.hotelCode}
                  </span>
                </TableCell>
                <TableCell>{r.city ?? "—"}</TableCell>
                <TableCell className="tabular-nums">
                  {formatNumber(r.bookingsLive, locale)}
                </TableCell>
                <TableCell className="tabular-nums">{formatNumber(r.roomNights, locale)}</TableCell>
                <TableCell className="tabular-nums">{money(r.sellTotal, r.currencyCode)}</TableCell>
                <TableCell className="tabular-nums text-ink-muted">
                  {money(r.netTotal, r.currencyCode)}
                </TableCell>
                <TableCell className="tabular-nums font-medium text-success-700">
                  {money(r.margin, r.currencyCode)}
                  <span className="ms-1 text-2xs text-ink-muted">
                    {formatNumber(r.marginPct, locale)}%
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </TableShell>
      )}
    </main>
  );
}
