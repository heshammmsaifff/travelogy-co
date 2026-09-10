"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { LuBus, LuPencil, LuPlus, LuRoute, LuTag, LuTrash2 } from "react-icons/lu";
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
import type {
  TransferRate,
  TransferRoute,
  VehicleType,
} from "@/modules/transfers/infrastructure/transfers.repository";
import {
  deleteTransferRateAction,
  deleteTransferRouteAction,
  deleteVehicleTypeAction,
  saveTransferRateAction,
  saveTransferRouteAction,
  saveVehicleTypeAction,
  type Result,
} from "./transfer-actions";

const SELECT_CLASS =
  "h-9 w-full cursor-pointer rounded-control border border-border bg-surface px-2.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus";

const DIRECTIONS = ["arrival", "departure", "point_to_point"] as const;

function useShow() {
  const t = useTranslations();
  return (result: Result) => {
    if (result.ok) toast.success({ title: t(result.messageKey) });
    else toast.error({ title: t(result.errorKey), description: result.detail });
    return result.ok;
  };
}

/** A checkbox styled like the ones the finance screens use. */
function Check({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="size-4 cursor-pointer rounded border-border-strong"
      />
      {label}
    </label>
  );
}

/**
 * Transfer inventory management (CLAUDE.md §13, Phase 8a).
 *
 * Three tabs rather than three pages: a rate is meaningless without the route
 * and the vehicle it prices, and an admin setting up a city moves between all
 * three in one sitting. The tab lives in component state rather than the URL
 * because nothing here is worth linking to on its own — unlike the list
 * filters in §15 (3.9), which are.
 */
export function TransferInventory({
  vehicles,
  routes,
  rates,
  locale,
  defaultCurrency,
}: {
  vehicles: VehicleType[];
  routes: TransferRoute[];
  rates: TransferRate[];
  locale: Locale;
  defaultCurrency: string;
}) {
  const t = useTranslations("transfers");
  const tCommon = useTranslations("common");
  const [tab, setTab] = useState<"vehicles" | "routes" | "rates">("vehicles");
  const [pending, startTransition] = useTransition();
  const show = useShow();
  const router = useRouter();

  const [vehicle, setVehicle] = useState<VehicleType | "new" | null>(null);
  const [route, setRoute] = useState<TransferRoute | "new" | null>(null);
  const [rate, setRate] = useState<TransferRate | "new" | null>(null);

  const currentVehicle = vehicle === "new" ? null : vehicle;
  const currentRoute = route === "new" ? null : route;
  const currentRate = rate === "new" ? null : rate;

  const name = <T extends { nameAr: string; nameEn: string }>(x: T) =>
    locale === "ar" ? x.nameAr : x.nameEn;
  const routeLabel = (r: TransferRoute) =>
    locale === "ar" ? `${r.fromNameAr} ← ${r.toNameAr}` : `${r.fromNameEn} → ${r.toNameEn}`;

  /** Confirm, then run a delete action and refresh. */
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

  const empty = (
    <Card>
      <CardBody className="py-12 text-center text-sm text-ink-muted">{t("empty")}</CardBody>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" className="flex gap-1 rounded-control bg-surface-sunken p-1">
          {(["vehicles", "routes", "rates"] as const).map((key) => (
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
              {key === "vehicles" ? (
                <LuBus className="size-4" aria-hidden />
              ) : key === "routes" ? (
                <LuRoute className="size-4" aria-hidden />
              ) : (
                <LuTag className="size-4" aria-hidden />
              )}
              {t(`tabs.${key}`)}
            </button>
          ))}
        </div>

        <Button
          size="sm"
          onClick={() =>
            tab === "vehicles"
              ? setVehicle("new")
              : tab === "routes"
                ? setRoute("new")
                : setRate("new")
          }
          disabled={tab === "rates" && (routes.length === 0 || vehicles.length === 0)}
        >
          <LuPlus aria-hidden />
          {t(tab === "vehicles" ? "createVehicle" : tab === "routes" ? "createRoute" : "createRate")}
        </Button>
      </div>

      {/* ------------------------------------------------------- vehicles */}
      {tab === "vehicles" ? (
        vehicles.length === 0 ? (
          empty
        ) : (
          <ul className="space-y-2">
            {vehicles.map((v) => (
              <li
                key={v.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3"
              >
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-ink-subtle" dir="ltr">
                      {v.code}
                    </span>
                    <span className="font-medium text-ink">{name(v)}</span>
                    {!v.isActive ? (
                      <Badge tone="neutral">{tCommon("status.suspended")}</Badge>
                    ) : null}
                  </p>
                  <p className="flex flex-wrap gap-3 text-xs text-ink-muted">
                    <span>{t("seats", { count: formatNumber(v.maxPassengers, locale) })}</span>
                    <span>{t("luggage", { count: formatNumber(v.maxLuggage, locale) })}</span>
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setVehicle(v)}>
                    <LuPencil aria-hidden />
                    {tCommon("edit")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={pending}
                    onClick={remove(() => deleteVehicleTypeAction(v.id))}
                  >
                    <LuTrash2 aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {/* --------------------------------------------------------- routes */}
      {tab === "routes" ? (
        routes.length === 0 ? (
          empty
        ) : (
          <ul className="space-y-2">
            {routes.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3"
              >
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-ink-subtle" dir="ltr">
                      {r.code}
                    </span>
                    <span className="font-medium text-ink">{routeLabel(r)}</span>
                    <Badge tone="brand">{t(`direction.${r.direction}`)}</Badge>
                    {!r.isActive ? (
                      <Badge tone="neutral">{tCommon("status.suspended")}</Badge>
                    ) : null}
                  </p>
                  <p className="flex flex-wrap gap-3 text-xs text-ink-muted">
                    <span>
                      {locale === "ar" ? r.cityAr : r.cityEn} · {r.countryCode}
                    </span>
                    {r.durationMinutes ? (
                      <span>
                        {t("duration", { count: formatNumber(r.durationMinutes, locale) })}
                      </span>
                    ) : null}
                    {r.distanceKm ? (
                      <span>
                        {formatNumber(r.distanceKm, locale)} {t("km")}
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setRoute(r)}>
                    <LuPencil aria-hidden />
                    {tCommon("edit")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={pending}
                    onClick={remove(() => deleteTransferRouteAction(r.id))}
                  >
                    <LuTrash2 aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {/* ---------------------------------------------------------- rates */}
      {tab === "rates" ? (
        <div className="space-y-3">
          {routes.length === 0 || vehicles.length === 0 ? (
            <Card>
              <CardBody className="py-12 text-center text-sm text-ink-muted">
                {t("empty")}
              </CardBody>
            </Card>
          ) : rates.length === 0 ? (
            empty
          ) : (
            <ul className="space-y-2">
              {rates.map((r) => {
                const rRoute = routes.find((x) => x.id === r.routeId);
                const rVehicle = vehicles.find((x) => x.id === r.vehicleTypeId);
                return (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-ink">
                          {rRoute ? routeLabel(rRoute) : "—"}
                        </span>
                        <span className="text-sm text-ink-muted">
                          {rVehicle ? name(rVehicle) : "—"}
                        </span>
                        {r.isClosed ? <Badge tone="danger">{t("fields.isClosed")}</Badge> : null}
                      </p>
                      <p className="flex flex-wrap gap-3 text-xs text-ink-muted">
                        <span className="tabular-nums">
                          {formatCurrency(r.pricePerVehicle, locale, r.currencyCode)}{" "}
                          {t("perVehicle")}
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
                        onClick={remove(() => deleteTransferRateAction(r.id))}
                      >
                        <LuTrash2 aria-hidden />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Said on the screen rather than left for someone to discover: a
              transfer has no allotment, so "available" means a rate covers
              the date. */}
          <p className="rounded-control bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
            {t("noAllocationNote")}
          </p>
        </div>
      ) : null}

      {/* --------------------------------------------------- vehicle form */}
      <Modal
        open={vehicle !== null}
        onOpenChange={(open) => !open && setVehicle(null)}
        title={currentVehicle ? tCommon("edit") : t("createVehicle")}
        closeLabel={tCommon("cancel")}
        size="lg"
      >
        <form
          key={currentVehicle?.id ?? "new-vehicle"}
          action={(fd) =>
            startTransition(async () => {
              if (show(await saveVehicleTypeAction(fd))) {
                setVehicle(null);
                router.refresh();
              }
            })
          }
          className="space-y-4"
        >
          <input type="hidden" name="id" value={currentVehicle?.id ?? ""} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              name="code"
              required
              dir="ltr"
              defaultValue={currentVehicle?.code ?? ""}
              label={t("fields.code")}
            />
            <div />
            <Input
              name="nameAr"
              required
              defaultValue={currentVehicle?.nameAr ?? ""}
              label={t("fields.nameAr")}
            />
            <Input
              name="nameEn"
              required
              dir="ltr"
              defaultValue={currentVehicle?.nameEn ?? ""}
              label={t("fields.nameEn")}
            />
            <Input
              name="maxPassengers"
              type="number"
              min={1}
              max={60}
              required
              dir="ltr"
              defaultValue={currentVehicle ? String(currentVehicle.maxPassengers) : "4"}
              label={t("fields.maxPassengers")}
            />
            <Input
              name="maxLuggage"
              type="number"
              min={0}
              max={200}
              required
              dir="ltr"
              defaultValue={currentVehicle ? String(currentVehicle.maxLuggage) : "2"}
              label={t("fields.maxLuggage")}
            />
            <Input
              name="descriptionAr"
              defaultValue={currentVehicle?.descriptionAr ?? ""}
              label={`${t("fields.description")} (AR)`}
            />
            <Input
              name="descriptionEn"
              dir="ltr"
              defaultValue={currentVehicle?.descriptionEn ?? ""}
              label={`${t("fields.description")} (EN)`}
            />
          </div>
          <Check
            name="isActive"
            label={t("fields.isActive")}
            defaultChecked={currentVehicle?.isActive ?? true}
          />
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="secondary" size="sm" onClick={() => setVehicle(null)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" size="sm" loading={pending}>
              {tCommon("save")}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ----------------------------------------------------- route form */}
      <Modal
        open={route !== null}
        onOpenChange={(open) => !open && setRoute(null)}
        title={currentRoute ? tCommon("edit") : t("createRoute")}
        closeLabel={tCommon("cancel")}
        size="lg"
      >
        <form
          key={currentRoute?.id ?? "new-route"}
          action={(fd) =>
            startTransition(async () => {
              if (show(await saveTransferRouteAction(fd))) {
                setRoute(null);
                router.refresh();
              }
            })
          }
          className="space-y-4"
        >
          <input type="hidden" name="id" value={currentRoute?.id ?? ""} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              name="code"
              required
              dir="ltr"
              defaultValue={currentRoute?.code ?? ""}
              label={t("fields.code")}
            />
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-ink">{t("fields.direction")}</span>
              <select
                name="direction"
                defaultValue={currentRoute?.direction ?? "point_to_point"}
                className={SELECT_CLASS}
              >
                {DIRECTIONS.map((d) => (
                  <option key={d} value={d}>
                    {t(`direction.${d}`)}
                  </option>
                ))}
              </select>
            </label>

            <CountrySelect
              name="countryCode"
              required
              defaultValue={currentRoute?.countryCode ?? "EG"}
              label={t("fields.country")}
            />
            <div />

            <Input
              name="cityAr"
              required
              defaultValue={currentRoute?.cityAr ?? ""}
              label={`${t("fields.city")} (AR)`}
            />
            <Input
              name="cityEn"
              required
              dir="ltr"
              defaultValue={currentRoute?.cityEn ?? ""}
              label={`${t("fields.city")} (EN)`}
            />

            <Input
              name="fromNameAr"
              required
              defaultValue={currentRoute?.fromNameAr ?? ""}
              label={`${t("fields.from")} (AR)`}
            />
            <Input
              name="fromNameEn"
              required
              dir="ltr"
              defaultValue={currentRoute?.fromNameEn ?? ""}
              label={`${t("fields.from")} (EN)`}
            />
            <Input
              name="toNameAr"
              required
              defaultValue={currentRoute?.toNameAr ?? ""}
              label={`${t("fields.to")} (AR)`}
            />
            <Input
              name="toNameEn"
              required
              dir="ltr"
              defaultValue={currentRoute?.toNameEn ?? ""}
              label={`${t("fields.to")} (EN)`}
            />

            <Input
              name="durationMinutes"
              type="number"
              min={1}
              max={1440}
              dir="ltr"
              defaultValue={
                currentRoute?.durationMinutes != null ? String(currentRoute.durationMinutes) : ""
              }
              label={t("fields.durationMinutes")}
            />
            <Input
              name="distanceKm"
              type="number"
              min={0}
              dir="ltr"
              defaultValue={currentRoute?.distanceKm != null ? String(currentRoute.distanceKm) : ""}
              label={t("fields.distanceKm")}
            />
          </div>
          <Check
            name="isActive"
            label={t("fields.isActive")}
            defaultChecked={currentRoute?.isActive ?? true}
          />
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="secondary" size="sm" onClick={() => setRoute(null)}>
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
          action={(fd) =>
            startTransition(async () => {
              if (show(await saveTransferRateAction(fd))) {
                setRate(null);
                router.refresh();
              }
            })
          }
          className="space-y-4"
        >
          <input type="hidden" name="id" value={currentRate?.id ?? ""} />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-ink">{t("fields.route")}</span>
              <select
                name="routeId"
                required
                defaultValue={currentRate?.routeId ?? ""}
                className={SELECT_CLASS}
              >
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {routeLabel(r)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-ink">{t("fields.vehicle")}</span>
              <select
                name="vehicleTypeId"
                required
                defaultValue={currentRate?.vehicleTypeId ?? ""}
                className={SELECT_CLASS}
              >
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {name(v)}
                  </option>
                ))}
              </select>
            </label>

            <Input
              name="pricePerVehicle"
              type="number"
              step="0.01"
              min="0"
              required
              dir="ltr"
              defaultValue={currentRate ? String(currentRate.pricePerVehicle) : ""}
              label={t("fields.pricePerVehicle")}
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
          <Check
            name="isClosed"
            label={t("fields.isClosed")}
            defaultChecked={currentRate?.isClosed ?? false}
          />
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
    </div>
  );
}
