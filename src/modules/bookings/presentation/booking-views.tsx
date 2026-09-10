import { getTranslations } from "next-intl/server";
import { LuCalendarClock, LuStar } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { Link } from "@/shared/i18n/navigation";
import { formatCurrency, formatDate, formatNumber } from "@/shared/lib/format";
import { Badge } from "@/shared/ui/badge";
import { Card, CardBody, CardHeader } from "@/shared/ui/card";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableShell,
} from "@/shared/ui/table";
import type {
  BookingDetail,
  BookingSummary,
} from "@/modules/bookings/infrastructure/bookings.repository";

/**
 * Booking list and detail, shared by the agent portal and the back-office.
 *
 * One implementation for both sides on purpose: the two views differ only in
 * whether the agency column is worth showing and which controls are offered.
 * Two copies would drift, and a booking is the same object to both parties.
 */

export const STATUS_TONE = {
  pending: "warning",
  confirmed: "success",
  cancelled: "danger",
  completed: "neutral",
} as const;

export async function BookingList({
  bookings,
  locale,
  basePath,
  showAgency = false,
}: {
  bookings: BookingSummary[];
  locale: Locale;
  basePath: string;
  showAgency?: boolean;
}) {
  const t = await getTranslations("bookings");

  if (bookings.length === 0) {
    return (
      <Card>
        <CardBody className="flex flex-col items-center gap-3 py-14 text-center">
          <LuCalendarClock className="size-8 text-ink-subtle" aria-hidden />
          <p className="max-w-md text-sm text-ink-muted">{t("empty")}</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <TableShell>
      <TableHead>
        <TableHeaderCell>{t("reference")}</TableHeaderCell>
        {showAgency ? <TableHeaderCell>{t("agency")}</TableHeaderCell> : null}
        <TableHeaderCell>{t("productLabel")}</TableHeaderCell>
        {/* Not "Stay": this column holds a hotel's date range or a transfer's
            single date, and one list shows both. */}
        <TableHeaderCell>{t("datesLabel")}</TableHeaderCell>
        <TableHeaderCell>{t("guest")}</TableHeaderCell>
        <TableHeaderCell>{t("total")}</TableHeaderCell>
        <TableHeaderCell>{t("statusLabel")}</TableHeaderCell>
      </TableHead>
      <TableBody>
        {bookings.map((b) => (
          <TableRow key={b.id}>
            <TableCell>
              <Link
                href={`${basePath}/${b.id}`}
                className="font-mono text-xs font-medium text-brand-700 hover:underline"
                dir="ltr"
              >
                {b.reference}
              </Link>
            </TableCell>
            {showAgency ? (
              <TableCell>
                <span className="block text-sm text-ink">{b.agencyName ?? "—"}</span>
                <span className="block font-mono text-2xs text-ink-subtle" dir="ltr">
                  {b.agencyCode ?? ""}
                </span>
              </TableCell>
            ) : null}
            <TableCell>
              <span className="block text-sm text-ink">{b.title ?? "—"}</span>
              <span className="block text-2xs text-ink-subtle">
                {t(`product.${b.productType}`)}
              </span>
            </TableCell>
            <TableCell>
              {/* A transfer happens on one day; printing "1 Jun → 1 Jun" for it
                  would read as a data error rather than as a single date. */}
              <span className="whitespace-nowrap text-xs text-ink-muted" dir="ltr">
                {b.productType === "transfer"
                  ? formatDate(b.checkIn, locale)
                  : `${formatDate(b.checkIn, locale)} → ${formatDate(b.checkOut, locale)}`}
              </span>
            </TableCell>
            <TableCell>{b.leadGuestName}</TableCell>
            <TableCell className="tabular-nums">
              {formatCurrency(b.totalSell, locale, b.currencyCode)}
            </TableCell>
            <TableCell>
              <Badge tone={STATUS_TONE[b.status]}>{t(`status.${b.status}`)}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </TableShell>
  );
}

export async function BookingDetailView({
  booking,
  locale,
  showAgency = false,
}: {
  booking: BookingDetail;
  locale: Locale;
  showAgency?: boolean;
}) {
  const t = await getTranslations("bookings");
  const tt = await getTranslations("transfers");
  const tp = await getTranslations("packages");
  const tSearch = await getTranslations("search");
  const tFinance = await getTranslations("finance");
  const tPromos = await getTranslations("promos");
  const tTax = await getTranslations("tax");
  const isTransfer = booking.productType === "transfer";
  const isPackage = booking.productType === "package";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title={t("detailsSection")} />
        <CardBody>
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-ink-muted">
                {/* "Stay" is a hotel word. A transfer has a date; a tour has a
                    departure and a return, which is a range but not a stay. */}
                {isTransfer ? tt("fields.date") : isPackage ? t("datesLabel") : t("stay")}
              </dt>
              <dd className="text-sm text-ink" dir="ltr">
                {isTransfer
                  ? formatDate(booking.checkIn, locale)
                  : `${formatDate(booking.checkIn, locale)} → ${formatDate(booking.checkOut, locale)}`}
              </dd>
            </div>
            {/* Nights and room occupancy are hotel facts. A transfer has
                passengers and vehicles instead, and they live on its own item
                below — printing "0 nights" here would be noise. A package has
                nights but sells travellers, so it takes the nights and leaves
                the room count to its own lines. */}
            {isTransfer ? null : isPackage ? (
              <>
                <div>
                  <dt className="text-xs text-ink-muted">{t("nights")}</dt>
                  <dd className="text-sm text-ink tabular-nums">
                    {formatNumber(booking.nights, locale)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-muted">{tp("fields.travellers")}</dt>
                  <dd className="text-sm text-ink tabular-nums">
                    {formatNumber(booking.rooms, locale)}
                  </dd>
                </div>
              </>
            ) : (
              <>
                <div>
                  <dt className="text-xs text-ink-muted">{t("nights")}</dt>
                  <dd className="text-sm text-ink tabular-nums">
                    {formatNumber(booking.nights, locale)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-muted">{t("occupancy")}</dt>
                  <dd className="text-sm text-ink tabular-nums">
                    {formatNumber(booking.adults, locale)} /{" "}
                    {formatNumber(booking.children, locale)} ·{" "}
                    {formatNumber(booking.rooms, locale)}
                  </dd>
                </div>
              </>
            )}
            <div>
              <dt className="text-xs text-ink-muted">{t("guest")}</dt>
              <dd className="text-sm text-ink">{booking.leadGuestName}</dd>
            </div>
            {booking.leadGuestEmail ? (
              <div>
                <dt className="text-xs text-ink-muted">{t("leadGuestEmail")}</dt>
                <dd className="text-sm text-ink" dir="ltr">
                  {booking.leadGuestEmail}
                </dd>
              </div>
            ) : null}
            {booking.leadGuestPhone ? (
              <div>
                <dt className="text-xs text-ink-muted">{t("leadGuestPhone")}</dt>
                <dd className="text-sm text-ink" dir="ltr">
                  {booking.leadGuestPhone}
                </dd>
              </div>
            ) : null}
            {showAgency ? (
              <div>
                <dt className="text-xs text-ink-muted">{t("agency")}</dt>
                <dd className="text-sm text-ink">{booking.agencyName ?? "—"}</dd>
              </div>
            ) : null}
          </dl>

          {/* `create_transfer_booking` stores the pickup notes in
              `special_requests` so one column serves both products — but the
              transfer card below already prints them under their own label,
              and the same sentence twice under two names reads as two
              different instructions to whoever is arranging the car. */}
          {booking.specialRequests && !isTransfer ? (
            <p className="mt-4 rounded-control bg-surface-sunken px-3 py-2 text-sm text-ink-muted">
              {t("specialRequests")}: {booking.specialRequests}
            </p>
          ) : null}

          {booking.cancellationReason ? (
            <p className="mt-4 rounded-control bg-danger-50 px-3 py-2 text-sm text-danger-700">
              {t("cancellationReason")}: {booking.cancellationReason}
            </p>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={isTransfer ? tt("title") : isPackage ? tp("tourLabel") : t("hotel")} />
        <CardBody className="p-0">
          {/* One card, two shapes. The money summary underneath is shared
              because it is the same money whichever product produced it —
              which is the whole point of transfers living in `bookings`. */}
          <ul className="divide-y divide-border">
            {booking.packageItems.map((line) => (
              <li
                key={line.id}
                className="flex flex-wrap items-start justify-between gap-4 px-5 py-4"
              >
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                    {line.name}
                    <Badge tone="brand">{tp(`occupancy.${line.occupancy}`)}</Badge>
                  </p>
                  <p className="text-sm text-ink-muted">
                    {tp(`occupancyHint.${line.occupancy}`)} ·{" "}
                    {tp("fields.travellers")}: {formatNumber(line.travellers, locale)}
                  </p>
                  <p className="flex flex-wrap items-center gap-3 text-xs text-ink-muted">
                    <span dir="ltr">
                      {formatDate(line.departureDate, locale)} →{" "}
                      {formatDate(line.returnDate, locale)}
                    </span>
                    {line.city ? <span>{line.city}</span> : null}
                  </p>
                </div>
                <div className="text-end">
                  <p className="text-lg font-semibold text-ink tabular-nums">
                    {formatCurrency(line.sellTotal, locale, line.currencyCode)}
                  </p>
                  <p className="text-2xs text-ink-muted">
                    {formatCurrency(line.sellPerPerson, locale, line.currencyCode)} ×{" "}
                    {formatNumber(line.travellers, locale)}
                  </p>
                </div>
              </li>
            ))}
            {booking.transferItems.map((leg) => (
              <li
                key={leg.id}
                className="flex flex-wrap items-start justify-between gap-4 px-5 py-4"
              >
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                    {locale === "ar"
                      ? `${leg.fromName} ← ${leg.toName}`
                      : `${leg.fromName} → ${leg.toName}`}
                    <Badge tone="brand">{tt(`direction.${leg.direction}`)}</Badge>
                  </p>
                  <p className="text-sm text-ink-muted">
                    {leg.vehicleName} · {tt("fields.passengers")}:{" "}
                    {formatNumber(leg.passengers, locale)} · {tt("fields.vehicles")}:{" "}
                    {formatNumber(leg.vehicles, locale)}
                  </p>
                  <p className="flex flex-wrap items-center gap-3 text-xs text-ink-muted">
                    <span dir="ltr">{formatDate(leg.transferDate, locale)}</span>
                    {leg.pickupTime ? (
                      <span dir="ltr">
                        {tt("fields.pickupTime")}: {leg.pickupTime.slice(0, 5)}
                      </span>
                    ) : null}
                    {leg.flightNumber ? (
                      <span dir="ltr">
                        {tt("fields.flightNumber")}: {leg.flightNumber}
                      </span>
                    ) : null}
                    {leg.city ? <span>{leg.city}</span> : null}
                  </p>
                  {leg.pickupNotes ? (
                    <p className="text-xs text-ink-muted">
                      {tt("fields.pickupNotes")}: {leg.pickupNotes}
                    </p>
                  ) : null}
                </div>
                <div className="text-end">
                  <p className="text-lg font-semibold text-ink tabular-nums">
                    {formatCurrency(leg.sellTotal, locale, leg.currencyCode)}
                  </p>
                  <p className="text-2xs text-ink-muted">
                    {formatCurrency(leg.sellPerVehicle, locale, leg.currencyCode)} ×{" "}
                    {formatNumber(leg.vehicles, locale)}
                  </p>
                </div>
              </li>
            ))}
            {booking.items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-start justify-between gap-4 px-5 py-4"
              >
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                    {item.hotelName}
                    {item.starRating ? (
                      <span className="flex items-center gap-0.5 text-xs text-warning-600">
                        <LuStar className="size-3 fill-current" aria-hidden />
                        {formatNumber(item.starRating, locale)}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-sm text-ink-muted">
                    {item.roomName} · {item.planName} · {item.mealPlanKey}
                  </p>
                  <p className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                    <Badge tone={item.isRefundable ? "success" : "danger"}>
                      {tSearch(item.isRefundable ? "refundable" : "nonRefundable")}
                    </Badge>
                    {item.city ? <span>{item.city}</span> : null}
                  </p>
                </div>
                <div className="text-end">
                  <p className="text-lg font-semibold text-ink tabular-nums">
                    {formatCurrency(item.sellTotal, locale, item.currencyCode)}
                  </p>
                  <p className="text-2xs text-ink-muted">
                    {formatCurrency(item.sellPerNight, locale, item.currencyCode)} ×{" "}
                    {formatNumber(item.nights, locale)} × {formatNumber(item.rooms, locale)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </CardBody>
        {/* The breakdown, not just the total: a booking that cannot explain
            its own discount cannot be invoiced or argued about. The database
            enforces that these three add up to what is charged. */}
        <dl className="space-y-1.5 border-t border-border px-5 py-3 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-ink-muted">{tFinance("debit")}</dt>
            <dd className="tabular-nums text-ink">
              {formatCurrency(booking.subtotalSell, locale, booking.currencyCode)}
            </dd>
          </div>
          {booking.discountAmount > 0 ? (
            <div className="flex items-center justify-between text-success-700">
              <dt>
                {tPromos("discount")}
                {booking.promoCode ? ` · ${booking.promoCode}` : ""}
              </dt>
              <dd className="tabular-nums">
                −{formatCurrency(booking.discountAmount, locale, booking.currencyCode)}
              </dd>
            </div>
          ) : null}
          {booking.taxAmount > 0 ? (
            <div className="flex items-center justify-between">
              <dt className="text-ink-muted">
                {tTax("percent")} {formatNumber(booking.taxRatePercent, locale)}%
              </dt>
              <dd className="tabular-nums text-ink">
                {formatCurrency(booking.taxAmount, locale, booking.currencyCode)}
              </dd>
            </div>
          ) : null}
          <div className="flex items-center justify-between border-t border-border pt-1.5">
            <dt className="font-medium text-ink">{t("total")}</dt>
            <dd className="text-lg font-semibold tabular-nums text-ink">
              {formatCurrency(booking.totalSell, locale, booking.currencyCode)}
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
