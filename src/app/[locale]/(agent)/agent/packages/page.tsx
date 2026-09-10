import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import Image from "next/image";
import { LuCalendarDays, LuImageOff, LuSearch, LuTriangleAlert, LuUsers } from "react-icons/lu";
import { isLocale } from "@/shared/i18n/config";
import { formatCurrency, formatDate, formatNumber } from "@/shared/lib/format";
import { cloudinaryUrl } from "@/shared/lib/media";
import { Badge } from "@/shared/ui/badge";
import { Card, CardBody } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { packageSearchSchema } from "@/modules/packages/application/schemas";
import { OCCUPANCIES } from "@/modules/packages/domain/occupancy";
import { searchPackages } from "@/modules/packages/infrastructure/packages.repository";
import { BookPackageButton } from "@/modules/packages/presentation/book-package-button";

/** ISO date `days` from today, UTC. */
function isoOffset(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Agent package search (CLAUDE.md §13, Phase 8c).
 *
 * A Server Component with the criteria in the URL, like every other search in
 * this project: a result set is shareable, survives a refresh, and needs no
 * client JavaScript (§11).
 *
 * One card per DEPARTURE rather than per tour, because the date is what an
 * agent is choosing between. Every price is a sell price the database has
 * already marked up; an agent has no read on `package_rates` at all
 * (§15, 6.1).
 */
export default async function AgentPackagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations("packages");
  const tCommon = await getTranslations("common");
  const sp = await searchParams;

  const defaults = {
    from: sp.from ?? isoOffset(0),
    to: sp.to ?? isoOffset(120),
    city: sp.city ?? "",
    q: sp.q ?? "",
    travellers: sp.travellers ?? "2",
  };

  const parsed = packageSearchSchema.safeParse({ ...defaults, ...sp });

  let offers: Awaited<ReturnType<typeof searchPackages>> | null = null;
  let searchError = false;

  if (parsed.success) {
    try {
      offers = await searchPackages(
        {
          from: parsed.data.from,
          to: parsed.data.to,
          city: parsed.data.city,
          query: parsed.data.q,
          travellers: parsed.data.travellers,
        },
        locale,
      );
    } catch {
      // A failed search must never render as "no tours available" (§15, 7.6).
      searchError = true;
    }
  }

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
              name="from"
              type="date"
              required
              dir="ltr"
              defaultValue={defaults.from}
              label={t("fields.from")}
            />
            <Input
              name="to"
              type="date"
              dir="ltr"
              defaultValue={defaults.to}
              label={t("fields.to")}
            />
            <Input name="city" defaultValue={defaults.city} label={t("fields.city")} />
            <Input
              name="q"
              defaultValue={defaults.q}
              label={t("fields.search")}
              leadingIcon={<LuSearch />}
            />
            <Input
              name="travellers"
              type="number"
              min={1}
              max={100}
              dir="ltr"
              defaultValue={defaults.travellers}
              label={t("fields.travellers")}
            />
            <div className="flex items-end lg:col-span-5">
              <button
                type="submit"
                className="h-9 cursor-pointer rounded-control bg-brand-600 px-6 text-sm font-medium text-ink-inverse transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                {t("submit")}
              </button>
            </div>
          </form>
        </CardBody>
      </Card>

      {!parsed.success ? (
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
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">
              {t("resultCount", { count: formatNumber(offers.length, locale) })}
            </p>

            {offers.map((offer) => {
              // "From" is the cheapest occupancy actually available — the
              // headline an agent scans by. The real prices are all in the
              // dialog, so this is a signpost rather than a quote.
              const prices = OCCUPANCIES.map((o) => offer.sell[o]).filter(
                (v): v is number => v !== null,
              );
              const fromPrice = prices.length > 0 ? Math.min(...prices) : null;

              return (
                <Card key={offer.departureId}>
                  <CardBody className="flex flex-col gap-4 sm:flex-row">
                    {offer.coverImage ? (
                      <Image
                        src={cloudinaryUrl(offer.coverImage, {
                          width: 320,
                          height: 240,
                          crop: "fill",
                        })}
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

                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                        {offer.name}
                        <Badge tone="brand">
                          {t("nights", { count: formatNumber(offer.durationNights, locale) })}
                        </Badge>
                      </p>

                      {offer.summary ? (
                        <p className="max-w-prose text-sm text-ink-muted">{offer.summary}</p>
                      ) : null}

                      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                        <span className="flex items-center gap-1.5" dir="ltr">
                          <LuCalendarDays className="size-3.5" aria-hidden />
                          {formatDate(offer.departureDate, locale)} →{" "}
                          {formatDate(offer.returnDate, locale)}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <LuUsers className="size-3.5" aria-hidden />
                          {t("seatsLeft", { count: formatNumber(offer.seatsLeft, locale) })}
                        </span>
                        <span>
                          {offer.city} · {offer.countryCode}
                        </span>
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end justify-between gap-3">
                      <div className="text-end">
                        {fromPrice !== null ? (
                          <>
                            <p className="text-2xs text-ink-muted">{t("fromPrice")}</p>
                            <p className="text-lg font-semibold text-ink tabular-nums">
                              {formatCurrency(fromPrice, locale, offer.currencyCode)}
                            </p>
                            <p className="text-2xs text-ink-muted">{t("perPerson")}</p>
                          </>
                        ) : null}
                      </div>

                      <BookPackageButton
                        departureId={offer.departureId}
                        sell={offer.sell}
                        seatsLeft={offer.seatsLeft}
                        currencyCode={offer.currencyCode}
                        locale={locale}
                      />
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )
      ) : null}
    </main>
  );
}
