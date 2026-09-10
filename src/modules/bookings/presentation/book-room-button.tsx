"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { LuCalendarCheck } from "react-icons/lu";
import { useRouter } from "@/shared/i18n/navigation";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { createBookingAction } from "./booking-actions";

/**
 * "Book this room" on a search result (CLAUDE.md §13, Phase 5a).
 *
 * Only the identifiers and the stay travel from the browser — never a price.
 * `create_booking` re-derives the amount from `search_availability()` and
 * refuses the booking outright if the rate has moved, which is why the dialog
 * says so rather than showing a total that might not be the one charged.
 */
export function BookRoomButton({
  roomTypeId,
  ratePlanId,
  stay,
  supplierKey,
}: {
  roomTypeId: string;
  ratePlanId: string;
  stay: { checkIn: string; checkOut: string; adults: number; children: number; rooms: number };
  supplierKey: string;
}) {
  const t = useTranslations("bookings");
  // Result keys are fully qualified ("<module>.errors.x"), so they resolve
  // against the ROOT translator — a namespaced one would look for
  // "<module>.<module>.errors.x" and print the key path instead.
  const tRoot = useTranslations();
  const tPromo = useTranslations("promos");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // External suppliers have no booking implementation yet — the port throws
  // rather than pretending (§15, 7.9). Offering the button would be a lie.
  if (supplierKey !== "internal") return null;

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
              const result = await createBookingAction(fd);
              if (result.ok) {
                toast.success({ title: t("created_"), description: result.reference });
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
          <input type="hidden" name="roomTypeId" value={roomTypeId} />
          <input type="hidden" name="ratePlanId" value={ratePlanId} />
          <input type="hidden" name="checkIn" value={stay.checkIn} />
          <input type="hidden" name="checkOut" value={stay.checkOut} />
          <input type="hidden" name="adults" value={stay.adults} />
          <input type="hidden" name="children" value={stay.children} />
          <input type="hidden" name="rooms" value={stay.rooms} />

          <Input
            name="leadGuestName"
            required
            label={t("leadGuestName")}
            placeholder={t("leadGuestNamePlaceholder")}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input name="leadGuestEmail" type="email" dir="ltr" label={t("leadGuestEmail")} />
            <Input name="leadGuestPhone" dir="ltr" label={t("leadGuestPhone")} />
          </div>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-ink">{t("specialRequests")}</span>
            <textarea
              name="specialRequests"
              rows={3}
              placeholder={t("specialRequestsPlaceholder")}
              className="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
            />
          </label>

          {/* An unusable code REFUSES the booking rather than being dropped,
              so the hint says the code is optional rather than implying it is
              applied on a best-effort basis. */}
          <Input
            name="promoCode"
            dir="ltr"
            label={tPromo("promoOptional")}
            autoComplete="off"
          />

          <p className="rounded-control bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
            {t("creditNote")}
          </p>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" size="sm" loading={pending}>
              {t("submit")}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
