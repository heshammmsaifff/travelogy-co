import { getTranslations } from "next-intl/server";
import type { Locale } from "@/shared/i18n/config";
import { formatCurrency, formatDate, formatNumber } from "@/shared/lib/format";
import type { BookingDetail } from "@/modules/bookings/infrastructure/bookings.repository";
import type { CompanyProfile } from "@/modules/finance/infrastructure/finance.repository";

/**
 * The voucher and the invoice (CLAUDE.md §13, Phase 5c).
 *
 * These are ordinary pages, printed by the reader's browser. See the print
 * block in `globals.css` for why that beats generating a PDF on the server for
 * an Arabic-first product — briefly: the browser gets bidirectional text right
 * and costs nothing per document.
 *
 * Everything shown comes from the snapshot stored on the booking, so a
 * document issued today still reads correctly after the hotel is renamed or
 * the contract renegotiated.
 */

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-2xs uppercase tracking-wide text-ink-subtle">{label}</dt>
      <dd className="text-sm text-ink">{value}</dd>
    </div>
  );
}

async function DocumentHeader({
  company,
  locale,
  title,
  reference,
  issuedOn,
}: {
  company: CompanyProfile;
  locale: Locale;
  title: string;
  reference: string;
  issuedOn: string;
}) {
  const t = await getTranslations("documents");
  const ar = locale === "ar";

  return (
    <header className="flex flex-wrap items-start justify-between gap-6 border-b border-border pb-5">
      <div className="min-w-0 space-y-1">
        <p className="text-lg font-semibold tracking-tight text-ink">
          {ar ? company.legalNameAr : company.legalNameEn}
        </p>
        {(ar ? company.addressAr : company.addressEn) ? (
          <p className="max-w-xs text-xs text-ink-muted">
            {ar ? company.addressAr : company.addressEn}
          </p>
        ) : null}
        <p className="flex flex-wrap gap-x-3 text-xs text-ink-muted" dir="ltr">
          {company.phone ? <span>{company.phone}</span> : null}
          {company.email ? <span>{company.email}</span> : null}
          {company.website ? <span>{company.website}</span> : null}
        </p>
        {company.taxNumber ? (
          <p className="text-xs text-ink-muted">
            {t("taxNumber")}: <span dir="ltr">{company.taxNumber}</span>
          </p>
        ) : null}
      </div>

      <div className="text-end">
        <p className="text-xl font-semibold tracking-tight text-ink">{title}</p>
        <p className="font-mono text-sm text-ink-muted" dir="ltr">
          {reference}
        </p>
        <p className="text-xs text-ink-muted">
          {t("issuedOn")}: {issuedOn}
        </p>
      </div>
    </header>
  );
}

export async function VoucherDocument({
  booking,
  company,
  locale,
}: {
  booking: BookingDetail;
  company: CompanyProfile;
  locale: Locale;
}) {
  const t = await getTranslations("documents");
  const tb = await getTranslations("bookings");
  const tt = await getTranslations("transfers");
  const tp = await getTranslations("packages");
  const item = booking.items[0];
  const leg = booking.transferItems[0];
  const tour = booking.packageItems[0];

  return (
    <article className="mx-auto max-w-3xl space-y-6 bg-surface p-8 text-ink">
      <DocumentHeader
        company={company}
        locale={locale}
        title={t(leg ? "voucherTitleTransfer" : tour ? "voucherTitlePackage" : "voucherTitle")}
        reference={booking.reference}
        issuedOn={formatDate(booking.createdAt, locale)}
      />

      {/* A voucher is what the guest hands to the hotel. Confirmation status
          is stated plainly, because a pending voucher is not one to travel on. */}
      <p
        className={
          "rounded-control px-4 py-2 text-sm " +
          (booking.status === "confirmed" || booking.status === "completed"
            ? "bg-success-50 text-success-700"
            : "bg-warning-50 text-warning-700")
        }
      >
        {tb(`status.${booking.status}`)}
        {booking.status === "pending" ? ` — ${t("notYetConfirmed")}` : ""}
      </p>

      <section data-print="keep" className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">{t("guestSection")}</h2>
        <dl className="grid gap-4 sm:grid-cols-3">
          <Field label={tb("guest")} value={booking.leadGuestName} />
          <Field label={tb("leadGuestEmail")} value={booking.leadGuestEmail} />
          <Field label={tb("leadGuestPhone")} value={booking.leadGuestPhone} />
          <Field label={t("bookedBy")} value={booking.agencyName} />
          <Field label={t("agencyReference")} value={booking.agencyCode} />
        </dl>
      </section>

      {/* The tour voucher: the dates, the length and who is travelling on
          which basis. No prices, for the same reason the hotel voucher shows
          none (§15, 12.5) — it is handed to the operator on the ground. */}
      {tour ? (
        <section data-print="keep" className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">{tp("tourLabel")}</h2>
          <dl className="grid gap-4 sm:grid-cols-3">
            <Field label={tp("tourLabel")} value={tour.name} />
            <Field label={t("city")} value={tour.city} />
            <Field
              label={tp("fields.departureDate")}
              value={formatDate(tour.departureDate, locale)}
            />
            <Field label={tp("fields.returnDate")} value={formatDate(tour.returnDate, locale)} />
            <Field label={tb("nights")} value={formatNumber(tour.durationNights, locale)} />
            <Field
              label={tp("fields.travellers")}
              value={formatNumber(booking.rooms, locale)}
            />
          </dl>
          <ul className="text-sm text-ink-muted">
            {booking.packageItems.map((line) => (
              <li key={line.id}>
                {tp(`occupancy.${line.occupancy}`)}: {formatNumber(line.travellers, locale)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* The driver's copy. Everything they need on the day — where, when,
          which flight — and nothing about money, for the same reason the hotel
          voucher shows no prices (§15, 12.5). */}
      {leg ? (
        <section data-print="keep" className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">{tt("title")}</h2>
          <dl className="grid gap-4 sm:grid-cols-3">
            <Field label={tt("fields.from")} value={leg.fromName} />
            <Field label={tt("fields.to")} value={leg.toName} />
            <Field label={t("city")} value={leg.city} />
            <Field label={tt("fields.date")} value={formatDate(leg.transferDate, locale)} />
            <Field
              label={tt("fields.pickupTime")}
              value={leg.pickupTime ? leg.pickupTime.slice(0, 5) : null}
            />
            <Field label={tt("fields.flightNumber")} value={leg.flightNumber} />
            <Field label={tt("fields.vehicle")} value={leg.vehicleName} />
            <Field
              label={tt("fields.passengers")}
              value={formatNumber(leg.passengers, locale)}
            />
            <Field label={tt("fields.vehicles")} value={formatNumber(leg.vehicles, locale)} />
          </dl>
          {leg.pickupNotes ? (
            <p className="text-sm text-ink-muted">
              {tt("fields.pickupNotes")}: {leg.pickupNotes}
            </p>
          ) : null}
        </section>
      ) : null}

      {item ? (
        <section data-print="keep" className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">{t("staySection")}</h2>
          <dl className="grid gap-4 sm:grid-cols-3">
            <Field label={tb("hotel")} value={item.hotelName} />
            <Field label={t("city")} value={item.city} />
            <Field
              label={tb("stay")}
              value={`${formatDate(booking.checkIn, locale)} → ${formatDate(booking.checkOut, locale)}`}
            />
            <Field label={t("roomType")} value={item.roomName} />
            <Field label={t("mealPlan")} value={`${item.planName} (${item.mealPlanKey})`} />
            <Field
              label={tb("occupancy")}
              value={`${formatNumber(booking.adults, locale)} / ${formatNumber(booking.children, locale)} · ${formatNumber(booking.rooms, locale)}`}
            />
            <Field label={tb("nights")} value={formatNumber(booking.nights, locale)} />
          </dl>
        </section>
      ) : null}

      {/* Same reason as the detail view: on a transfer this column holds the
          pickup notes, which the section above already printed. */}
      {booking.specialRequests && !leg ? (
        <section data-print="keep" className="space-y-1">
          <h2 className="text-sm font-semibold text-ink">{tb("specialRequests")}</h2>
          <p className="text-sm text-ink-muted">{booking.specialRequests}</p>
        </section>
      ) : null}

      {/* Deliberately no prices: a voucher is handed to the hotel, and the
          agent's sell price is not the hotel's business. */}
      <footer className="border-t border-border pt-4 text-xs text-ink-muted">
        {t(leg ? "voucherFooterTransfer" : tour ? "voucherFooterPackage" : "voucherFooter")}
      </footer>
    </article>
  );
}

export async function InvoiceDocument({
  booking,
  company,
  locale,
}: {
  booking: BookingDetail;
  company: CompanyProfile;
  locale: Locale;
}) {
  const t = await getTranslations("documents");
  const tb = await getTranslations("bookings");
  const tf = await getTranslations("finance");
  const tPromos = await getTranslations("promos");
  const tTax = await getTranslations("tax");
  const tt = await getTranslations("transfers");
  const tp = await getTranslations("packages");
  const ar = locale === "ar";
  const isTransfer = booking.productType === "transfer";
  const isPackage = booking.productType === "package";
  const money = (n: number) => formatCurrency(n, locale, booking.currencyCode);

  return (
    <article className="mx-auto max-w-3xl space-y-6 bg-surface p-8 text-ink">
      <DocumentHeader
        company={company}
        locale={locale}
        title={t("invoiceTitle")}
        reference={booking.reference}
        issuedOn={formatDate(booking.createdAt, locale)}
      />

      <section data-print="keep" className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">{t("billedTo")}</h2>
        <dl className="grid gap-4 sm:grid-cols-3">
          <Field label={tf("agency")} value={booking.agencyName} />
          <Field label={t("agencyReference")} value={booking.agencyCode} />
          <Field label={tb("guest")} value={booking.leadGuestName} />
        </dl>
      </section>

      <section data-print="keep" className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">{t("linesSection")}</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-2xs uppercase tracking-wide text-ink-subtle">
              <th className="py-2 text-start font-medium">{t("description")}</th>
              {/* An invoice line multiplies unit x quantity, and the two
                  quantities differ per product: nights x rooms, or vehicles. */}
              <th className="py-2 text-start font-medium">
                {isTransfer ? tt("fields.passengers") : isPackage ? tb("nights") : tb("nights")}
              </th>
              <th className="py-2 text-start font-medium">
                {isTransfer
                  ? tt("fields.vehicles")
                  : isPackage
                    ? tp("fields.travellers")
                    : tb("rooms")}
              </th>
              {/* "Per night" is a hotel unit; a transfer is priced per
                  vehicle, and an invoice column that names the wrong unit is
                  an invoice that cannot be checked. */}
              <th className="py-2 text-end font-medium">
                {isTransfer ? tt("perVehicle") : isPackage ? tp("perPerson") : t("unitPrice")}
              </th>
              <th className="py-2 text-end font-medium">{tb("total")}</th>
            </tr>
          </thead>
          <tbody>
            {booking.packageItems.map((line) => (
              <tr key={line.id} className="border-b border-border">
                <td className="py-2">
                  <span className="block">{line.name}</span>
                  <span className="block text-xs text-ink-muted">
                    {tp(`occupancy.${line.occupancy}`)} ·{" "}
                    {formatDate(line.departureDate, locale)} →{" "}
                    {formatDate(line.returnDate, locale)}
                  </span>
                </td>
                <td className="py-2 tabular-nums">{formatNumber(line.durationNights, locale)}</td>
                <td className="py-2 tabular-nums">{formatNumber(line.travellers, locale)}</td>
                <td className="py-2 text-end tabular-nums">{money(line.sellPerPerson)}</td>
                <td className="py-2 text-end tabular-nums">{money(line.sellTotal)}</td>
              </tr>
            ))}
            {booking.transferItems.map((leg) => (
              <tr key={leg.id} className="border-b border-border">
                <td className="py-2">
                  <span className="block">
                    {ar ? `${leg.fromName} ← ${leg.toName}` : `${leg.fromName} → ${leg.toName}`}
                  </span>
                  <span className="block text-xs text-ink-muted">
                    {leg.vehicleName} · {formatDate(leg.transferDate, locale)}
                  </span>
                </td>
                <td className="py-2 tabular-nums">{formatNumber(leg.passengers, locale)}</td>
                <td className="py-2 tabular-nums">{formatNumber(leg.vehicles, locale)}</td>
                <td className="py-2 text-end tabular-nums">{money(leg.sellPerVehicle)}</td>
                <td className="py-2 text-end tabular-nums">{money(leg.sellTotal)}</td>
              </tr>
            ))}
            {booking.items.map((item) => (
              <tr key={item.id} className="border-b border-border">
                <td className="py-2">
                  <span className="block">{item.hotelName}</span>
                  <span className="block text-xs text-ink-muted">
                    {item.roomName} · {item.planName} ·{" "}
                    {formatDate(booking.checkIn, locale)} → {formatDate(booking.checkOut, locale)}
                  </span>
                </td>
                <td className="py-2 tabular-nums">{formatNumber(item.nights, locale)}</td>
                <td className="py-2 tabular-nums">{formatNumber(item.rooms, locale)}</td>
                <td className="py-2 text-end tabular-nums">{money(item.sellPerNight)}</td>
                <td className="py-2 text-end tabular-nums">{money(item.sellTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* The same breakdown the booking stores, and the database guarantees
          these three reach the total (§15, 11.6). */}
      <section data-print="keep" className="ms-auto max-w-xs space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-ink-muted">{t("subtotal")}</span>
          <span className="tabular-nums">{money(booking.subtotalSell)}</span>
        </div>
        {booking.discountAmount > 0 ? (
          <div className="flex justify-between text-success-700">
            <span>
              {tPromos("discount")}
              {booking.promoCode ? ` · ${booking.promoCode}` : ""}
            </span>
            <span className="tabular-nums">−{money(booking.discountAmount)}</span>
          </div>
        ) : null}
        {booking.taxAmount > 0 ? (
          <div className="flex justify-between">
            <span className="text-ink-muted">
              {tTax("percent")} {formatNumber(booking.taxRatePercent, locale)}%
            </span>
            <span className="tabular-nums">{money(booking.taxAmount)}</span>
          </div>
        ) : null}
        <div className="flex justify-between border-t border-border pt-1.5 text-base font-semibold">
          <span>{tb("total")}</span>
          <span className="tabular-nums">{money(booking.totalSell)}</span>
        </div>
      </section>

      <footer className="space-y-2 border-t border-border pt-4 text-xs text-ink-muted">
        {/* §10: settlement is on the credit account, never online. Saying so on
            the invoice stops anyone looking for a payment link. */}
        <p>{t("settlementNote")}</p>
        {(ar ? company.invoiceFooterAr : company.invoiceFooterEn) ? (
          <p className="whitespace-pre-line">
            {ar ? company.invoiceFooterAr : company.invoiceFooterEn}
          </p>
        ) : null}
      </footer>
    </article>
  );
}
