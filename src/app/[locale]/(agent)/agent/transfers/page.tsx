import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { LuBus, LuClock, LuLuggage, LuSearch, LuTriangleAlert, LuUsers } from "react-icons/lu";
import { isLocale } from "@/shared/i18n/config";
import { formatCurrency, formatNumber } from "@/shared/lib/format";
import { Badge } from "@/shared/ui/badge";
import { Card, CardBody } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { transferSearchSchema } from "@/modules/transfers/application/schemas";
import { searchTransfers } from "@/modules/transfers/infrastructure/transfers.repository";
import { BookTransferButton } from "@/modules/transfers/presentation/book-transfer-button";

/** ISO date `days` from today, UTC. */
function isoOffset(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Agent transfer search (CLAUDE.md §13, Phase 8a).
 *
 * A Server Component with the criteria in the URL, exactly like the hotel
 * search: a result set is then shareable, survives a refresh, and needs no
 * client JavaScript (§11).
 *
 * Every price here is a SELL price the database has already marked up. No net
 * rate reaches this component and an agent has no read access to
 * `transfer_rates` at all (§15, 6.1).
 */
export default async function AgentTransfersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations("transfers");
  const tCommon = await getTranslations("common");
  const sp = await searchParams;

  const hasQuery = Boolean(sp.date);
  const parsed = hasQuery ? transferSearchSchema.safeParse(sp) : null;

  const defaults = {
    date: sp.date ?? isoOffset(14),
    passengers: sp.passengers ?? "2",
    city: sp.city ?? "",
    q: sp.q ?? "",
  };

  let offers: Awaited<ReturnType<typeof searchTransfers>> | null = null;
  let searchError = false;

  if (parsed?.success) {
    const d = parsed.data;
    try {
      offers = await searchTransfers(
        { date: d.date, passengers: d.passengers, city: d.city, query: d.q },
        locale,
      );
    } catch {
      // A failed search must never render as "no transfers available" (§15, 7.6).
      searchError = true;
    }
  }

  const criteria = parsed?.success ? parsed.data : null;

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("searchTitle")}</h1>
        <p className="max-w-prose text-sm text-ink-muted">{t("searchDescription")}</p>
      </div>

      <Card>
        <CardBody>
          <form method="get" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Input
              name="date"
              type="date"
              required
              dir="ltr"
              defaultValue={defaults.date}
              label={t("fields.date")}
            />
            <Input
              name="passengers"
              type="number"
              min={1}
              max={60}
              dir="ltr"
              defaultValue={defaults.passengers}
              label={t("fields.passengers")}
            />
            <Input name="city" defaultValue={defaults.city} label={t("fields.city")} />
            <Input
              name="q"
              defaultValue={defaults.q}
              label={t("fields.search")}
              leadingIcon={<LuSearch />}
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

      {parsed && !parsed.success ? (
        <p role="alert" className="rounded-control bg-danger-50 px-3 py-2 text-sm text-danger-700">
          {tCommon("required")}
        </p>
      ) : null}

      {searchError ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-control bg-danger-50 px-3 py-2 text-sm text-danger-700"
        >
          <LuTriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("errors.saveFailed")}
        </p>
      ) : null}

      {offers ? (
        offers.length === 0 ? (
          <Card>
            <CardBody className="py-12 text-center text-sm text-ink-muted">
              {t("noResults")}
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">
              {t("resultCount", { count: formatNumber(offers.length, locale) })}
            </p>

            <ul className="space-y-2">
              {offers.map((offer) => {
                // How many of THIS vehicle the party needs — offered as the
                // dialog's default rather than decided for the agent, who may
                // want two smaller cars for luggage reasons.
                const suggested = Math.max(
                  1,
                  Math.ceil((criteria?.passengers ?? 1) / offer.maxPassengers),
                );

                return (
                  <li
                    key={`${offer.routeId}:${offer.vehicleTypeId}`}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-border bg-surface px-4 py-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                        {locale === "ar"
                          ? `${offer.fromName} ← ${offer.toName}`
                          : `${offer.fromName} → ${offer.toName}`}
                        <Badge tone="brand">{t(`direction.${offer.direction}`)}</Badge>
                      </p>
                      <p className="flex flex-wrap items-center gap-3 text-xs text-ink-muted">
                        <span className="flex items-center gap-1">
                          <LuBus className="size-3" aria-hidden />
                          {offer.vehicleName}
                        </span>
                        <span className="flex items-center gap-1">
                          <LuUsers className="size-3" aria-hidden />
                          {t("seats", { count: formatNumber(offer.maxPassengers, locale) })}
                        </span>
                        <span className="flex items-center gap-1">
                          <LuLuggage className="size-3" aria-hidden />
                          {t("luggage", { count: formatNumber(offer.maxLuggage, locale) })}
                        </span>
                        {offer.durationMinutes ? (
                          <span className="flex items-center gap-1">
                            <LuClock className="size-3" aria-hidden />
                            {t("duration", { count: formatNumber(offer.durationMinutes, locale) })}
                          </span>
                        ) : null}
                        {offer.city ? <span>{offer.city}</span> : null}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-end">
                        {/* Per vehicle, said out loud. The equivalent figure on
                            the hotel search was read as a total once, and a
                            multi-room booking was charged for one room (§15,
                            Phase 7). */}
                        <p className="text-lg font-semibold text-ink tabular-nums">
                          {formatCurrency(offer.sellPerVehicle, locale, offer.currencyCode)}
                        </p>
                        <p className="text-2xs text-ink-muted">{t("perVehicle")}</p>
                      </div>

                      {criteria ? (
                        <BookTransferButton
                          routeId={offer.routeId}
                          vehicleTypeId={offer.vehicleTypeId}
                          date={criteria.date}
                          passengers={criteria.passengers}
                          suggestedVehicles={suggested}
                          direction={offer.direction}
                        />
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )
      ) : null}
    </main>
  );
}
