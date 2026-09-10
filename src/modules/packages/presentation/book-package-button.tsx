"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { LuCalendarCheck } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { useRouter } from "@/shared/i18n/navigation";
import { formatCurrency, formatNumber } from "@/shared/lib/format";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { OCCUPANCIES, type Occupancy } from "@/modules/packages/domain/occupancy";
import { createPackageBookingAction } from "./package-actions";

/** The form field each occupancy submits under. */
const FIELD: Record<Occupancy, string> = {
  single: "single",
  double: "double",
  triple: "triple",
  child: "children",
};

/**
 * "Book this departure" (CLAUDE.md §13, Phase 8c).
 *
 * The prices are shown beside each counter because a tour is quoted per
 * person and the agent is deciding between "two sharing" and "one single" on
 * price. They still do not travel with the form: `create_package_booking`
 * re-derives every one of them from `search_packages()` and refuses the
 * booking if a rate has moved (§15, 10.3).
 *
 * The running total is a READOUT of what the page already knows — not a
 * second pricing rule. If it ever disagrees with what is charged, the
 * database is right and this is the bug.
 */
export function BookPackageButton({
  departureId,
  sell,
  seatsLeft,
  currencyCode,
  locale,
}: {
  departureId: string;
  sell: Record<Occupancy, number | null>;
  seatsLeft: number;
  currencyCode: string;
  locale: Locale;
}) {
  const t = useTranslations("packages");
  const tRoot = useTranslations();
  const tBookings = useTranslations("bookings");
  const tPromo = useTranslations("promos");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [counts, setCounts] = useState<Record<Occupancy, number>>({
    single: 0,
    double: 0,
    triple: 0,
    child: 0,
  });
  const router = useRouter();

  const travellers = OCCUPANCIES.reduce((sum, o) => sum + counts[o], 0);
  const total = OCCUPANCIES.reduce((sum, o) => sum + (sell[o] ?? 0) * counts[o], 0);
  const overCapacity = travellers > seatsLeft;

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <LuCalendarCheck aria-hidden />
        {t("book")}
      </Button>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={t("dialogTitle")}
        description={t("dialogDescription")}
        closeLabel={tCommon("cancel")}
        size="md"
      >
        <form
          action={(fd) =>
            startTransition(async () => {
              const result = await createPackageBookingAction(fd);
              if (result.ok) {
                toast.success({ title: t("created"), description: result.reference });
                setOpen(false);
                if (result.bookingId) router.push(`/agent/bookings/${result.bookingId}`);
                else router.refresh();
              } else {
                toast.error({ title: tRoot(result.errorKey), description: result.detail });
              }
            })
          }
          className="space-y-4"
        >
          <input type="hidden" name="departureId" value={departureId} />

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-ink">{t("travellerCounts")}</legend>
            {OCCUPANCIES.map((o) => (
              <div
                key={o}
                className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm text-ink">{t(`occupancy.${o}`)}</p>
                  <p className="text-xs text-ink-muted">
                    {sell[o] === null
                      ? t("noRateForOccupancy")
                      : `${formatCurrency(sell[o]!, locale, currencyCode)} ${t("perPerson")}`}
                  </p>
                </div>
                <input
                  type="number"
                  name={FIELD[o]}
                  min={0}
                  max={100}
                  dir="ltr"
                  aria-label={t(`occupancy.${o}`)}
                  // An occupancy with no rate cannot be bought: the database
                  // refuses it by name, so the screen should not offer it.
                  disabled={sell[o] === null}
                  value={counts[o]}
                  onChange={(e) =>
                    setCounts((c) => ({ ...c, [o]: Math.max(0, Number(e.target.value) || 0) }))
                  }
                  className="h-9 w-20 rounded-control border border-border bg-surface px-2.5 text-sm text-ink tabular-nums focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50"
                />
              </div>
            ))}
          </fieldset>

          <div className="flex items-center justify-between rounded-control bg-surface-sunken px-3 py-2 text-sm">
            <span className="text-ink-muted">
              {t("totalTravellers", { count: formatNumber(travellers, locale) })}
            </span>
            <span className="font-semibold tabular-nums text-ink">
              {formatCurrency(total, locale, currencyCode)}
            </span>
          </div>

          {overCapacity ? (
            <p role="alert" className="rounded-control bg-danger-50 px-3 py-2 text-sm text-danger-700">
              {t("seatsLeft", { count: formatNumber(seatsLeft, locale) })}
            </p>
          ) : null}

          <Input
            name="leadGuestName"
            required
            label={tBookings("leadGuestName")}
            placeholder={tBookings("leadGuestNamePlaceholder")}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input name="leadGuestEmail" type="email" dir="ltr" label={tBookings("leadGuestEmail")} />
            <Input name="leadGuestPhone" dir="ltr" label={tBookings("leadGuestPhone")} />
          </div>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-ink">{tBookings("specialRequests")}</span>
            <textarea
              name="specialRequests"
              rows={2}
              className="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
            />
          </label>

          <Input name="promoCode" dir="ltr" label={tPromo("promoOptional")} autoComplete="off" />

          <p className="rounded-control bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
            {tBookings("creditNote")}
          </p>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button
              type="submit"
              size="sm"
              loading={pending}
              disabled={travellers === 0 || overCapacity}
            >
              {tBookings("submit")}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
