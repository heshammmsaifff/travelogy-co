import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import Image from "next/image";
import {
  LuBedDouble,
  LuImageOff,
  LuSearch,
  LuStar,
  LuTriangleAlert,
  LuUtensils,
} from "react-icons/lu";
import { isLocale } from "@/shared/i18n/config";
import { formatCurrency, formatNumber } from "@/shared/lib/format";
import { cloudinaryUrl } from "@/shared/lib/media";
import { Badge } from "@/shared/ui/badge";
import { Card, CardBody, CardHeader } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { availabilitySearchSchema } from "@/modules/hotels/application/search.schemas";
import { searchAllProviders } from "@/modules/hotels/infrastructure/providers/registry";
import { listOpenQuotations } from "@/modules/bookings/infrastructure/quotations.repository";
import { SaveOfferButton } from "@/modules/bookings/presentation/save-offer-button";
import { BookRoomButton } from "@/modules/bookings/presentation/book-room-button";

/** ISO date `days` from today, UTC. */
function isoOffset(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Agent hotel search (CLAUDE.md §13, Phase 3c).
 *
 * Queries every enabled provider through the registry, so the page is
 * unaware of which supplier answered — internal inventory and any external
 * supplier arrive in the same shape.
 *
 * Every price here is a SELL price with markup already applied by
 * search_availability(). No net rate reaches this component, and an agent has
 * no read access to the rate tables at all (§15, decision 6.1).
 *
 * A Server Component: search is a GET with the criteria in the URL, so a
 * result set is shareable, survives a refresh, and needs no client JS.
 */
export default async function AgentSearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations("search");
  const tCommon = await getTranslations("common");
  const sp = await searchParams;

  const hasQuery = Boolean(sp.checkIn && sp.checkOut);
  const parsed = hasQuery ? availabilitySearchSchema.safeParse(sp) : null;

  const defaults = {
    checkIn: sp.checkIn ?? isoOffset(14),
    checkOut: sp.checkOut ?? isoOffset(17),
    adults: sp.adults ?? "2",
    children: sp.children ?? "0",
    rooms: sp.rooms ?? "1",
    city: sp.city ?? "",
    q: sp.q ?? "",
  };

  // Loaded once for the whole page: every "save" dialog offers the same list.
  const openQuotations = parsed?.success ? await listOpenQuotations() : [];

  // The stay these results answer, narrowed once so the offer cards can pass
  // it along without a non-null assertion per field.
  const stay = parsed?.success
    ? {
        checkIn: parsed.data.checkIn,
        checkOut: parsed.data.checkOut,
        adults: parsed.data.adults,
        children: parsed.data.children,
        rooms: parsed.data.rooms,
      }
    : null;

  let results: Awaited<ReturnType<typeof searchAllProviders>> | null = null;
  let searchError: string | null = null;

  if (parsed?.success) {
    const d = parsed.data;
    try {
      results = await searchAllProviders(
        {
          checkIn: d.checkIn,
          checkOut: d.checkOut,
          occupancy: { adults: d.adults, childAges: Array.from({ length: d.children }, () => 8) },
          rooms: d.rooms,
          countryCode: d.country || undefined,
          city: d.city || undefined,
          query: d.q || undefined,
        },
        // Session context: the database resolves this agent's own agency, markup
        // and supplier preferences — nothing here names an agency.
      );
    } catch (error) {
      // A failed search must never render as "no hotels available".
      searchError = error instanceof Error ? error.message : String(error);
    }
  }

  const validationKey = parsed && !parsed.success ? parsed.error.issues[0]?.message : null;
  const nights = parsed?.success
    ? Math.round(
        (Date.parse(`${parsed.data.checkOut}T00:00:00Z`) -
          Date.parse(`${parsed.data.checkIn}T00:00:00Z`)) /
          86_400_000,
      )
    : 0;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("title")}</h1>
        <p className="max-w-prose text-sm text-ink-muted">{t("description")}</p>
      </div>

      <Card>
        <CardBody>
          {/* GET form: the criteria are the URL, so a result set is shareable. */}
          <form method="get" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              name="checkIn"
              type="date"
              required
              dir="ltr"
              defaultValue={defaults.checkIn}
              label={t("fields.checkIn")}
            />
            <Input
              name="checkOut"
              type="date"
              required
              dir="ltr"
              defaultValue={defaults.checkOut}
              label={t("fields.checkOut")}
            />
            <Input
              name="city"
              defaultValue={defaults.city}
              label={t("fields.city")}
              placeholder={t("fields.cityPlaceholder")}
            />
            <Input
              name="q"
              defaultValue={defaults.q}
              label={t("fields.hotelName")}
              leadingIcon={<LuSearch />}
            />

            <Input
              name="adults"
              type="number"
              min={1}
              max={20}
              dir="ltr"
              defaultValue={defaults.adults}
              label={t("fields.adults")}
            />
            <Input
              name="children"
              type="number"
              min={0}
              max={10}
              dir="ltr"
              defaultValue={defaults.children}
              label={t("fields.children")}
            />
            <Input
              name="rooms"
              type="number"
              min={1}
              max={10}
              dir="ltr"
              defaultValue={defaults.rooms}
              label={t("fields.rooms")}
            />

            <div className="flex items-end">
              <button
                type="submit"
                className="h-9 w-full cursor-pointer rounded-control bg-brand-600 px-4 text-sm font-medium text-ink-inverse transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                {t("submit")}
              </button>
            </div>
          </form>
        </CardBody>
      </Card>

      {validationKey ? (
        <p role="alert" className="rounded-control bg-danger-50 px-3 py-2 text-sm text-danger-700">
          {t.has(validationKey) ? t(validationKey) : tCommon("required")}
        </p>
      ) : null}

      {searchError ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-control bg-danger-50 px-3 py-2 text-sm text-danger-700"
        >
          <LuTriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("errors.searchFailed")}
        </p>
      ) : null}

      {/* Partial results are said out loud rather than quietly under-reported. */}
      {results && results.failures.length > 0 ? (
        <p className="flex items-start gap-2 rounded-control bg-warning-50 px-3 py-2 text-sm text-warning-700">
          <LuTriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("errors.partialResults", { count: formatNumber(results.failures.length, locale) })}
        </p>
      ) : null}

      {results ? (
        results.results.length === 0 ? (
          <Card>
            <CardBody className="py-12 text-center text-sm text-ink-muted">
              {t("noResults")}
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">
              {t("resultCount", {
                hotels: formatNumber(results.results.length, locale),
                nights: formatNumber(nights, locale),
              })}
            </p>

            {results.results.map((hotel) => (
              <Card key={`${hotel.supplierKey}:${hotel.hotelRef}`}>
                <CardHeader
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      {locale === "ar" ? hotel.nameAr : hotel.nameEn}
                      {hotel.starRating ? (
                        <span className="flex items-center gap-0.5 text-xs text-warning-600">
                          <LuStar className="size-3 fill-current" aria-hidden />
                          {formatNumber(hotel.starRating, locale)}
                        </span>
                      ) : null}
                      {/* Multi-supplier Aggregation & Comparison (Hotels B2B Hub §6.2) */}
                      {hotel.supplierComparison && hotel.supplierComparison.length > 1 ? (
                        <span className="flex flex-wrap items-center gap-1.5">
                          <Badge tone="success">
                            {t("multiSupplierCount", { count: hotel.supplierComparison.length })}
                          </Badge>
                          {hotel.lowestSupplierKey ? (
                            <span className="text-2xs font-normal text-ink-muted">
                              {t("bestPriceFrom", { supplier: hotel.lowestSupplierKey })}
                            </span>
                          ) : null}
                        </span>
                      ) : hotel.supplierKey !== "internal" ? (
                        <Badge tone="warning">{hotel.supplierKey}</Badge>
                      ) : null}
                    </span>
                  }
                  description={`${locale === "ar" ? hotel.cityAr : hotel.cityEn} · ${hotel.countryCode}`}
                />

                <CardBody className="flex flex-col gap-4 sm:flex-row">
                  {hotel.coverUrl ? (
                    <Image
                      src={cloudinaryUrl(hotel.coverUrl, { width: 320, height: 240, crop: "fill" })}
                      alt=""
                      width={160}
                      height={120}
                      unoptimized
                      className="h-30 w-40 shrink-0 rounded-control border border-border object-cover"
                    />
                  ) : (
                    <span className="flex h-30 w-40 shrink-0 items-center justify-center rounded-control border border-dashed border-border-strong text-ink-subtle">
                      <LuImageOff className="size-5" aria-hidden />
                    </span>
                  )}

                  <ul className="min-w-0 flex-1 divide-y divide-border">
                    {hotel.offers.map((offer) => (
                      <li
                        key={offer.offerRef}
                        className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                            <LuBedDouble className="size-4 shrink-0 text-ink-subtle" aria-hidden />
                            {locale === "ar" ? offer.roomNameAr : offer.roomNameEn}
                            {offer.supplierKey && offer.supplierKey !== "internal" ? (
                              <span className="rounded border border-border bg-surface-raised px-1.5 py-0.5 text-2xs font-normal text-ink-muted">
                                {offer.supplierKey}
                              </span>
                            ) : null}
                          </p>
                          <p className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                            <span className="flex items-center gap-1">
                              <LuUtensils className="size-3" aria-hidden />
                              {offer.mealPlanKey}
                            </span>
                            <Badge tone={offer.isRefundable ? "success" : "danger"}>
                              {t(offer.isRefundable ? "refundable" : "nonRefundable")}
                            </Badge>
                            <span>
                              {t("roomsLeft", {
                                count: formatNumber(offer.roomsAvailable, locale),
                              })}
                            </span>
                          </p>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-end">
                            {/* search_availability() prices ONE room for the
                                stay; a booking for N rooms costs N times this.
                                Showing the per-room figure as the total is how
                                a multi-room booking came to be charged for one
                                (§15, Phase 7). */}
                            <p className="text-lg font-semibold text-ink tabular-nums">
                              {formatCurrency(
                                offer.sellTotal * (stay?.rooms ?? 1),
                                locale,
                                offer.currencyCode,
                              )}
                            </p>
                            <p className="text-2xs text-ink-muted">
                              {t("perNight", {
                                price: formatCurrency(
                                  offer.sellPerNight,
                                  locale,
                                  offer.currencyCode,
                                ),
                                nights: formatNumber(offer.nights, locale),
                              })}
                            </p>
                          </div>

                          {/* Everything the agent is looking at travels into the
                              quotation, because the saved row is a snapshot of
                              this moment rather than a pointer at a live rate. */}
                          {stay ? (
                            <SaveOfferButton
                              openQuotations={openQuotations}
                              stay={stay}
                              offer={{
                                supplierKey: hotel.supplierKey,
                                hotelRef: hotel.hotelRef,
                                roomRef: offer.roomRef,
                                ratePlanRef: offer.ratePlanRef,
                                offerRef: offer.offerRef,
                                hotelNameAr: hotel.nameAr,
                                hotelNameEn: hotel.nameEn,
                                cityAr: hotel.cityAr,
                                cityEn: hotel.cityEn,
                                countryCode: hotel.countryCode,
                                starRating: hotel.starRating ? String(hotel.starRating) : "",
                                coverUrl: hotel.coverUrl ?? "",
                                roomNameAr: offer.roomNameAr,
                                roomNameEn: offer.roomNameEn,
                                planNameAr: offer.planNameAr,
                                planNameEn: offer.planNameEn,
                                mealPlanKey: offer.mealPlanKey,
                                nights: String(offer.nights),
                                itemRooms: String(stay.rooms),
                                currencyCode: offer.currencyCode,
                                sellPerNight: String(offer.sellPerNight),
                                sellTotal: String(offer.sellTotal),
                                isRefundable: String(offer.isRefundable),
                              }}
                            />
                          ) : null}

                          {stay ? (
                            <BookRoomButton
                              roomTypeId={offer.roomRef}
                              ratePlanId={offer.ratePlanRef}
                              supplierKey={hotel.supplierKey}
                              stay={stay}
                            />
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            ))}
          </div>
        )
      ) : null}
    </main>
  );
}
