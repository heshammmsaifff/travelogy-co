import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import Image from "next/image";
import { LuArrowLeft, LuArrowRight, LuImageOff, LuStar, LuTriangleAlert } from "react-icons/lu";
import { LOCALE_META, type Locale } from "@/shared/i18n/config";
import { Link } from "@/shared/i18n/navigation";
import { formatCurrency, formatDate, formatNumber } from "@/shared/lib/format";
import { cloudinaryUrl } from "@/shared/lib/media";
import { Badge } from "@/shared/ui/badge";
import { Card, CardBody, CardHeader } from "@/shared/ui/card";
import { getQuotation } from "@/modules/bookings/infrastructure/quotations.repository";
import {
  DeleteQuotationButton,
  QuotationDetailsForm,
  QuotationStatusControls,
  RemoveItemButton,
} from "@/modules/bookings/presentation/quotation-controls";

/**
 * One saved quotation (CLAUDE.md §13, Phase 4).
 *
 * Every price shown here is a snapshot with its capture time beside it. That
 * is not decoration: a saved price can be days old, and presenting it as if it
 * were live would be the fake-completeness §2.3 forbids.
 */
export default async function QuotationDetailPage({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("quotations");
  const tSearch = await getTranslations("search");
  const quotation = await getQuotation(id, locale);

  // RLS returns nothing for another company's quotation, so "not found" and
  // "not yours" are deliberately the same answer.
  if (!quotation) notFound();

  const { dir } = LOCALE_META[locale];
  const Back = dir === "rtl" ? LuArrowRight : LuArrowLeft;

  const tone = {
    draft: "neutral",
    sent: "brand",
    accepted: "success",
    expired: "warning",
  } as const;

  const nights = Math.round(
    (Date.parse(`${quotation.checkOut}T00:00:00Z`) - Date.parse(`${quotation.checkIn}T00:00:00Z`)) /
      86_400_000,
  );

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <Link
        href="/agent/quotations"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <Back className="size-4" aria-hidden />
        {t("backToList")}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="font-mono text-xs text-ink-muted" dir="ltr">
            {quotation.reference}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {quotation.title ?? t("untitled")}
          </h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            <Badge tone={tone[quotation.status]}>{t(`status.${quotation.status}`)}</Badge>
            <span dir="ltr">
              {formatDate(quotation.checkIn, locale)} → {formatDate(quotation.checkOut, locale)}
            </span>
            <span>
              {t("itemCount", { count: formatNumber(quotation.items.length, locale) })}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <QuotationStatusControls quotationId={quotation.id} status={quotation.status} />
          <DeleteQuotationButton quotationId={quotation.id} locale={locale} />
        </div>
      </div>

      {/* A saved price is a snapshot. Say it once, prominently, rather than
          hoping the per-row capture date is noticed. */}
      <div className="flex items-start gap-2 rounded-card border border-warning-100 bg-warning-50 px-4 py-3">
        <LuTriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-700" aria-hidden />
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium text-warning-700">{t("staleTitle")}</p>
          <p className="text-sm text-warning-700">{t("staleBody")}</p>
        </div>
      </div>

      <Card>
        <CardHeader title={t("items")} />
        <CardBody className="p-0">
          {quotation.items.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-ink-muted">{t("noItems")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {quotation.items.map((item) => (
                <li key={item.id} className="flex flex-col gap-4 px-5 py-4 sm:flex-row">
                  {item.coverUrl ? (
                    <Image
                      src={cloudinaryUrl(item.coverUrl, { width: 240, height: 180, crop: "fill" })}
                      alt=""
                      width={120}
                      height={90}
                      unoptimized
                      className="h-[90px] w-[120px] shrink-0 rounded-control border border-border object-cover"
                    />
                  ) : (
                    <span className="flex h-[90px] w-[120px] shrink-0 items-center justify-center rounded-control border border-dashed border-border-strong text-ink-subtle">
                      <LuImageOff className="size-5" aria-hidden />
                    </span>
                  )}

                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                      {item.hotelName}
                      {item.starRating ? (
                        <span className="flex items-center gap-0.5 text-xs text-warning-600">
                          <LuStar className="size-3 fill-current" aria-hidden />
                          {formatNumber(item.starRating, locale)}
                        </span>
                      ) : null}
                      {item.supplierKey !== "internal" ? (
                        <Badge tone="warning">{item.supplierKey}</Badge>
                      ) : null}
                    </p>
                    <p className="text-sm text-ink-muted">
                      {item.roomName} · {item.planName} · {item.mealPlanKey}
                    </p>
                    <p className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                      <Badge tone={item.isRefundable ? "success" : "danger"}>
                        {tSearch(item.isRefundable ? "refundable" : "nonRefundable")}
                      </Badge>
                      <span>{t("capturedAt", { date: formatDate(item.capturedAt, locale) })}</span>
                    </p>
                  </div>

                  <div className="flex shrink-0 items-start gap-2">
                    <div className="text-end">
                      <p className="text-lg font-semibold text-ink tabular-nums">
                        {formatCurrency(item.sellTotal, locale, item.currencyCode)}
                      </p>
                      <p className="text-2xs text-ink-muted">
                        {formatCurrency(item.sellPerNight, locale, item.currencyCode)} ×{" "}
                        {formatNumber(item.nights, locale)}
                      </p>
                    </div>
                    <RemoveItemButton
                      quotationId={quotation.id}
                      itemId={item.id}
                      locale={locale}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
        {quotation.items.length > 0 ? (
          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <span className="text-sm font-medium text-ink">{t("total")}</span>
            <span className="text-lg font-semibold text-ink tabular-nums">
              {formatCurrency(quotation.total, locale, quotation.currencyCode)}
            </span>
          </div>
        ) : null}
      </Card>

      <Card>
        <CardHeader title={t("detailsSection")} description={t("detailsSectionDescription")} />
        <CardBody>
          <QuotationDetailsForm
            quotationId={quotation.id}
            defaults={{
              title: quotation.title ?? "",
              guestName: quotation.guestName ?? "",
              validUntil: quotation.validUntil ?? "",
              notes: quotation.notes ?? "",
            }}
          />
        </CardBody>
      </Card>

      <p className="text-xs text-ink-subtle">
        {t("stay")}: {formatNumber(nights, locale)} · {t("occupancy")}:{" "}
        {formatNumber(quotation.adults, locale)} / {formatNumber(quotation.children, locale)} ·{" "}
        {formatNumber(quotation.rooms, locale)}
      </p>
    </main>
  );
}
