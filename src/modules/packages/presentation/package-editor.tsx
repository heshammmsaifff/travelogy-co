"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { LuCalendarDays, LuInfo, LuListOrdered, LuPencil, LuPlus, LuTag, LuTrash2 } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { useRouter } from "@/shared/i18n/navigation";
import { cn } from "@/shared/lib/cn";
import { confirmAction } from "@/shared/lib/confirm";
import { formatCurrency, formatDate, formatNumber } from "@/shared/lib/format";
import { toast } from "@/shared/lib/toast";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardBody } from "@/shared/ui/card";
import { CountrySelect } from "@/shared/ui/country-select";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { OCCUPANCIES, type Occupancy } from "@/modules/packages/domain/occupancy";
import {
  type PackageDay,
  type PackageDeparture,
  type PackageRate,
  type PackageSummary,
} from "@/modules/packages/infrastructure/packages.repository";
import {
  deletePackageDayAction,
  deletePackageDepartureAction,
  deletePackageRateAction,
  savePackageAction,
  savePackageDayAction,
  savePackageDepartureAction,
  savePackageRateAction,
  type Result,
} from "./package-actions";

const SELECT_CLASS =
  "h-9 w-full cursor-pointer rounded-control border border-border bg-surface px-2.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus";

type Tab = "details" | "itinerary" | "rates" | "departures";

function useShow() {
  const t = useTranslations();
  return (result: Result) => {
    if (result.ok) toast.success({ title: t(result.messageKey) });
    else toast.error({ title: t(result.errorKey), description: result.detail });
    return result.ok;
  };
}

function Textarea({
  name,
  label,
  defaultValue,
  rows = 3,
  dir,
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  rows?: number;
  dir?: "ltr" | "rtl";
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      <textarea
        name={name}
        rows={rows}
        dir={dir}
        defaultValue={defaultValue ?? ""}
        className="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
      />
    </label>
  );
}

/**
 * One tour, all of it (CLAUDE.md §13, Phase 8c).
 *
 * Four tabs rather than four pages: an admin building a tour moves between the
 * itinerary, the prices and the dates in one sitting, and none of the three
 * makes sense without the others. The tab is component state because none of
 * these is worth linking to on its own — unlike the list filters in §15 (3.9).
 */
export function PackageEditor({
  pkg,
  days,
  rates,
  departures,
  locale,
  defaultCurrency,
}: {
  pkg: PackageSummary;
  days: PackageDay[];
  rates: PackageRate[];
  departures: PackageDeparture[];
  locale: Locale;
  defaultCurrency: string;
}) {
  const t = useTranslations("packages");
  const tCommon = useTranslations("common");
  const [tab, setTab] = useState<Tab>("details");
  const [pending, startTransition] = useTransition();
  const show = useShow();
  const router = useRouter();

  const [day, setDay] = useState<PackageDay | "new" | null>(null);
  const [rate, setRate] = useState<PackageRate | "new" | null>(null);
  const [departure, setDeparture] = useState<PackageDeparture | "new" | null>(null);

  const currentDay = day === "new" ? null : day;
  const currentRate = rate === "new" ? null : rate;
  const currentDeparture = departure === "new" ? null : departure;

  const remove = (run: () => Promise<Result>) => async () => {
    const ok = await confirmAction({
      title: t("deleteConfirmTitle"),
      body: t("deleteConfirmBody"),
      confirmLabel: tCommon("delete"),
      cancelLabel: tCommon("cancel"),
      dir: locale === "ar" ? "rtl" : "ltr",
    });
    if (!ok) return;
    startTransition(async () => {
      if (show(await run())) router.refresh();
    });
  };

  const submit = (action: (fd: FormData) => Promise<Result>, close: () => void) => (fd: FormData) =>
    startTransition(async () => {
      if (show(await action(fd))) {
        close();
        router.refresh();
      }
    });

  const empty = (
    <Card>
      <CardBody className="py-12 text-center text-sm text-ink-muted">{t("empty")}</CardBody>
    </Card>
  );

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" className="flex flex-wrap gap-1 rounded-control bg-surface-sunken p-1">
          {(["details", "itinerary", "rates", "departures"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-control px-3 py-1.5 text-sm font-medium transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                tab === key ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink",
              )}
            >
              {key === "details" ? (
                <LuInfo className="size-4" aria-hidden />
              ) : key === "itinerary" ? (
                <LuListOrdered className="size-4" aria-hidden />
              ) : key === "rates" ? (
                <LuTag className="size-4" aria-hidden />
              ) : (
                <LuCalendarDays className="size-4" aria-hidden />
              )}
              {t(`tabs.${key}`)}
            </button>
          ))}
        </div>

        {tab !== "details" ? (
          <Button
            size="sm"
            onClick={() =>
              tab === "itinerary"
                ? setDay("new")
                : tab === "rates"
                  ? setRate("new")
                  : setDeparture("new")
            }
          >
            <LuPlus aria-hidden />
            {t(
              tab === "itinerary"
                ? "createDay"
                : tab === "rates"
                  ? "createRate"
                  : "createDeparture",
            )}
          </Button>
        ) : null}
      </div>

      {/* -------------------------------------------------------- details */}
      {tab === "details" ? (
        <Card>
          <CardBody>
            <form action={submit(savePackageAction, () => {})} className="space-y-4">
              <input type="hidden" name="id" value={pkg.id} />

              <div className="grid gap-4 sm:grid-cols-2">
                <Input name="code" required dir="ltr" defaultValue={pkg.code} label={t("fields.code")} />
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-ink">{t("fields.statusLabel")}</span>
                  <select name="status" defaultValue={pkg.status} className={SELECT_CLASS}>
                    <option value="draft">{t("status.draft")}</option>
                    <option value="active">{t("status.active")}</option>
                    <option value="archived">{t("status.archived")}</option>
                  </select>
                </label>

                <Input name="nameAr" required defaultValue={pkg.nameAr} label={t("fields.nameAr")} />
                <Input
                  name="nameEn"
                  required
                  dir="ltr"
                  defaultValue={pkg.nameEn}
                  label={t("fields.nameEn")}
                />

                <Input name="cityAr" required defaultValue={pkg.cityAr} label={`${t("fields.city")} (AR)`} />
                <Input
                  name="cityEn"
                  required
                  dir="ltr"
                  defaultValue={pkg.cityEn}
                  label={`${t("fields.city")} (EN)`}
                />

                <CountrySelect
                  name="countryCode"
                  required
                  defaultValue={pkg.countryCode}
                  label={t("fields.country")}
                />
                <Input
                  name="durationNights"
                  type="number"
                  min={1}
                  max={60}
                  required
                  dir="ltr"
                  defaultValue={String(pkg.durationNights)}
                  label={t("fields.durationNights")}
                  hint={t("returnDateNote")}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Textarea
                  name="summaryAr"
                  label={`${t("fields.summary")} (AR)`}
                  defaultValue={pkg.summaryAr}
                />
                <Textarea
                  name="summaryEn"
                  dir="ltr"
                  label={`${t("fields.summary")} (EN)`}
                  defaultValue={pkg.summaryEn}
                />
                <Textarea
                  name="inclusionsAr"
                  label={`${t("fields.inclusions")} (AR)`}
                  defaultValue={pkg.inclusionsAr}
                />
                <Textarea
                  name="inclusionsEn"
                  dir="ltr"
                  label={`${t("fields.inclusions")} (EN)`}
                  defaultValue={pkg.inclusionsEn}
                />
                <Textarea
                  name="exclusionsAr"
                  label={`${t("fields.exclusions")} (AR)`}
                  defaultValue={pkg.exclusionsAr}
                />
                <Textarea
                  name="exclusionsEn"
                  dir="ltr"
                  label={`${t("fields.exclusions")} (EN)`}
                  defaultValue={pkg.exclusionsEn}
                />
              </div>

              <div className="flex justify-end border-t border-border pt-4">
                <Button type="submit" size="sm" loading={pending}>
                  {tCommon("save")}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      ) : null}

      {/* ------------------------------------------------------ itinerary */}
      {tab === "itinerary" ? (
        days.length === 0 ? (
          empty
        ) : (
          <ol className="space-y-2">
            {days.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3"
              >
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <Badge tone="brand">
                      {t("fields.dayNumber")} {formatNumber(d.dayNumber, locale)}
                    </Badge>
                    <span className="font-medium text-ink">
                      {locale === "ar" ? d.titleAr : d.titleEn}
                    </span>
                  </p>
                  {(locale === "ar" ? d.bodyAr : d.bodyEn) ? (
                    <p className="max-w-prose text-xs text-ink-muted">
                      {locale === "ar" ? d.bodyAr : d.bodyEn}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setDay(d)}>
                    <LuPencil aria-hidden />
                    {tCommon("edit")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={pending}
                    onClick={remove(() => deletePackageDayAction(d.id, pkg.id))}
                  >
                    <LuTrash2 aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        )
      ) : null}

      {/* ---------------------------------------------------------- rates */}
      {tab === "rates" ? (
        <div className="space-y-3">
          {rates.length === 0 ? (
            empty
          ) : (
            <ul className="space-y-2">
              {rates.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">{t(`occupancy.${r.occupancy}`)}</span>
                      <span className="text-xs text-ink-muted">
                        {t(`occupancyHint.${r.occupancy}`)}
                      </span>
                      {r.isClosed ? <Badge tone="danger">{t("fields.isClosed")}</Badge> : null}
                    </p>
                    <p className="flex flex-wrap gap-3 text-xs text-ink-muted">
                      <span className="tabular-nums">
                        {formatCurrency(r.netPerPerson, locale, r.currencyCode)} {t("perPerson")}
                      </span>
                      <span dir="ltr">
                        {formatDate(r.validFrom, locale)} → {formatDate(r.validTo, locale)}
                      </span>
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setRate(r)}>
                      <LuPencil aria-hidden />
                      {tCommon("edit")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={pending}
                      onClick={remove(() => deletePackageRateAction(r.id, pkg.id))}
                    >
                      <LuTrash2 aria-hidden />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {/* ----------------------------------------------------- departures */}
      {tab === "departures" ? (
        <div className="space-y-3">
          {departures.length === 0 ? (
            empty
          ) : (
            <ul className="space-y-2">
              {departures.map((d) => {
                const full = d.seatsSold >= d.capacity;
                return (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-ink" dir="ltr">
                          {formatDate(d.departureDate, locale)} → {formatDate(d.returnDate, locale)}
                        </span>
                        {d.isClosed ? <Badge tone="danger">{t("departureClosed")}</Badge> : null}
                        {full ? <Badge tone="warning">{t("departureFull")}</Badge> : null}
                        {d.departureDate < today ? (
                          <Badge tone="neutral">{t("errors.alreadyLeft")}</Badge>
                        ) : null}
                      </p>
                      <p className="flex flex-wrap gap-3 text-xs text-ink-muted">
                        <span className="tabular-nums">
                          {t("fields.seatsSold")}: {formatNumber(d.seatsSold, locale)} /{" "}
                          {formatNumber(d.capacity, locale)}
                        </span>
                        {d.notes ? <span>{d.notes}</span> : null}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setDeparture(d)}>
                        <LuPencil aria-hidden />
                        {tCommon("edit")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={pending}
                        onClick={remove(() => deletePackageDepartureAction(d.id, pkg.id))}
                      >
                        <LuTrash2 aria-hidden />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Said on the screen rather than left to be discovered: unlike a
              transfer, a tour has real capacity. */}
          <p className="rounded-control bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
            {t("capacityNote")}
          </p>
        </div>
      ) : null}

      {/* ------------------------------------------------------- day form */}
      <Modal
        open={day !== null}
        onOpenChange={(open) => !open && setDay(null)}
        title={currentDay ? tCommon("edit") : t("createDay")}
        closeLabel={tCommon("cancel")}
        size="lg"
      >
        <form
          key={currentDay?.id ?? "new-day"}
          action={submit(savePackageDayAction, () => setDay(null))}
          className="space-y-4"
        >
          <input type="hidden" name="id" value={currentDay?.id ?? ""} />
          <input type="hidden" name="packageId" value={pkg.id} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              name="dayNumber"
              type="number"
              min={1}
              max={61}
              required
              dir="ltr"
              defaultValue={String(currentDay?.dayNumber ?? days.length + 1)}
              label={t("fields.dayNumber")}
            />
            <div />
            <Input
              name="titleAr"
              required
              defaultValue={currentDay?.titleAr ?? ""}
              label={`${t("fields.dayTitle")} (AR)`}
            />
            <Input
              name="titleEn"
              required
              dir="ltr"
              defaultValue={currentDay?.titleEn ?? ""}
              label={`${t("fields.dayTitle")} (EN)`}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Textarea
              name="bodyAr"
              label={`${t("fields.dayBody")} (AR)`}
              defaultValue={currentDay?.bodyAr}
            />
            <Textarea
              name="bodyEn"
              dir="ltr"
              label={`${t("fields.dayBody")} (EN)`}
              defaultValue={currentDay?.bodyEn}
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="secondary" size="sm" onClick={() => setDay(null)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" size="sm" loading={pending}>
              {tCommon("save")}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ------------------------------------------------------ rate form */}
      <Modal
        open={rate !== null}
        onOpenChange={(open) => !open && setRate(null)}
        title={currentRate ? tCommon("edit") : t("createRate")}
        closeLabel={tCommon("cancel")}
        size="lg"
      >
        <form
          key={currentRate?.id ?? "new-rate"}
          action={submit(savePackageRateAction, () => setRate(null))}
          className="space-y-4"
        >
          <input type="hidden" name="id" value={currentRate?.id ?? ""} />
          <input type="hidden" name="packageId" value={pkg.id} />

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-ink">{t("fields.occupancyLabel")}</span>
              <select
                name="occupancy"
                required
                defaultValue={currentRate?.occupancy ?? "double"}
                className={SELECT_CLASS}
              >
                {OCCUPANCIES.map((o: Occupancy) => (
                  <option key={o} value={o}>
                    {t(`occupancy.${o}`)} — {t(`occupancyHint.${o}`)}
                  </option>
                ))}
              </select>
            </label>
            <Input
              name="netPerPerson"
              type="number"
              step="0.01"
              min="0"
              required
              dir="ltr"
              defaultValue={currentRate ? String(currentRate.netPerPerson) : ""}
              label={t("fields.netPerPerson")}
            />

            <Input
              name="currencyCode"
              required
              dir="ltr"
              maxLength={3}
              defaultValue={currentRate?.currencyCode ?? defaultCurrency}
              label={t("fields.currency")}
              hint="ISO 4217"
            />
            <div />

            <Input
              name="validFrom"
              type="date"
              required
              dir="ltr"
              defaultValue={currentRate?.validFrom ?? ""}
              label={t("fields.validFrom")}
            />
            <Input
              name="validTo"
              type="date"
              required
              dir="ltr"
              defaultValue={currentRate?.validTo ?? ""}
              label={t("fields.validTo")}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name="isClosed"
              defaultChecked={currentRate?.isClosed ?? false}
              className="size-4 cursor-pointer rounded border-border-strong"
            />
            {t("fields.isClosed")}
          </label>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="secondary" size="sm" onClick={() => setRate(null)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" size="sm" loading={pending}>
              {tCommon("save")}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ------------------------------------------------- departure form */}
      <Modal
        open={departure !== null}
        onOpenChange={(open) => !open && setDeparture(null)}
        title={currentDeparture ? tCommon("edit") : t("createDeparture")}
        description={t("returnDateNote")}
        closeLabel={tCommon("cancel")}
        size="md"
      >
        <form
          key={currentDeparture?.id ?? "new-departure"}
          action={submit(savePackageDepartureAction, () => setDeparture(null))}
          className="space-y-4"
        >
          <input type="hidden" name="id" value={currentDeparture?.id ?? ""} />
          <input type="hidden" name="packageId" value={pkg.id} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              name="departureDate"
              type="date"
              required
              dir="ltr"
              defaultValue={currentDeparture?.departureDate ?? ""}
              label={t("fields.departureDate")}
            />
            <Input
              name="capacity"
              type="number"
              min={1}
              max={500}
              required
              dir="ltr"
              defaultValue={String(currentDeparture?.capacity ?? 20)}
              label={t("fields.capacity")}
            />
          </div>

          <Textarea name="notes" rows={2} label={t("fields.notes")} defaultValue={currentDeparture?.notes} />

          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name="isClosed"
              defaultChecked={currentDeparture?.isClosed ?? false}
              className="size-4 cursor-pointer rounded border-border-strong"
            />
            {t("fields.isClosed")}
          </label>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="secondary" size="sm" onClick={() => setDeparture(null)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" size="sm" loading={pending}>
              {tCommon("save")}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
