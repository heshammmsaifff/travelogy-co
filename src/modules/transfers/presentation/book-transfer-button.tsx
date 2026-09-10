"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { LuCalendarCheck } from "react-icons/lu";
import { useRouter } from "@/shared/i18n/navigation";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { createTransferBookingAction } from "./transfer-actions";

/**
 * "Book this transfer" on a search result (CLAUDE.md §13, Phase 8a).
 *
 * Only identifiers and the trip travel from the browser — never a price, for
 * the same reason the hotel dialog sends none: `create_transfer_booking`
 * re-derives the amount from `search_transfers()` and refuses outright if the
 * rate moved (§15, 10.3).
 *
 * The vehicle count is chosen HERE rather than on the search form, because it
 * depends on which vehicle the agent picked: eight passengers is two sedans or
 * one minibus. The price shown on the card is per vehicle and the dialog says
 * so.
 */
export function BookTransferButton({
  routeId,
  vehicleTypeId,
  date,
  passengers,
  suggestedVehicles,
  direction,
}: {
  routeId: string;
  vehicleTypeId: string;
  date: string;
  passengers: number;
  suggestedVehicles: number;
  direction: "arrival" | "departure" | "point_to_point";
}) {
  const t = useTranslations("transfers");
  // Result keys are fully qualified ("<module>.errors.x"), so they resolve
  // against the ROOT translator — a namespaced one would look for
  // "<module>.<module>.errors.x" and print the key path instead.
  const tRoot = useTranslations();
  const tBookings = useTranslations("bookings");
  const tPromo = useTranslations("promos");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

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
              const result = await createTransferBookingAction(fd);
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
          <input type="hidden" name="routeId" value={routeId} />
          <input type="hidden" name="vehicleTypeId" value={vehicleTypeId} />
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="passengers" value={passengers} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              name="vehicles"
              type="number"
              min={1}
              max={20}
              required
              dir="ltr"
              defaultValue={String(suggestedVehicles)}
              label={t("fields.vehicles")}
            />
            <Input name="pickupTime" type="time" dir="ltr" label={t("fields.pickupTime")} />
          </div>

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

          {/* Only an airport leg has a flight to track. Asking for one on a
              city-to-city transfer is a field nobody can fill in. */}
          {direction !== "point_to_point" ? (
            <Input name="flightNumber" dir="ltr" label={t("fields.flightNumber")} />
          ) : null}

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-ink">{t("fields.pickupNotes")}</span>
            <textarea
              name="pickupNotes"
              rows={3}
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
            <Button type="submit" size="sm" loading={pending}>
              {tBookings("submit")}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
