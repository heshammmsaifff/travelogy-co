"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { LuBookmarkPlus } from "react-icons/lu";
import { useRouter } from "@/shared/i18n/navigation";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { saveOfferToQuotationAction } from "./quotation-actions";

/**
 * "Save to quotation" on a search result (CLAUDE.md §13, Phase 4).
 *
 * The whole offer is carried in hidden fields rather than re-fetched by id,
 * because that is precisely what makes a quotation item a snapshot: the row
 * records what this agent was shown at this moment, not what the rate says
 * later. The server re-validates every field, so the hidden inputs are
 * convenience, not trust (§12).
 */

export type OfferPayload = {
  supplierKey: string;
  hotelRef: string;
  roomRef: string;
  ratePlanRef: string;
  offerRef: string;
  hotelNameAr: string;
  hotelNameEn: string;
  cityAr: string;
  cityEn: string;
  countryCode: string;
  starRating: string;
  coverUrl: string;
  roomNameAr: string;
  roomNameEn: string;
  planNameAr: string;
  planNameEn: string;
  mealPlanKey: string;
  nights: string;
  itemRooms: string;
  currencyCode: string;
  sellPerNight: string;
  sellTotal: string;
  isRefundable: string;
};

export function SaveOfferButton({
  offer,
  stay,
  openQuotations,
}: {
  offer: OfferPayload;
  stay: { checkIn: string; checkOut: string; adults: number; children: number; rooms: number };
  openQuotations: { id: string; reference: string; title: string | null }[];
}) {
  const t = useTranslations("quotations");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <LuBookmarkPlus aria-hidden />
        {t("addToQuotation")}
      </Button>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={t("addDialogTitle")}
        description={t("addDialogDescription")}
        closeLabel={tCommon("cancel")}
        size="md"
      >
        <form
          action={(fd) =>
            startTransition(async () => {
              const result = await saveOfferToQuotationAction(fd);
              if (result.ok) {
                toast.success({ title: t("added") });
                setOpen(false);
                router.refresh();
              } else {
                toast.error({ title: t("errors.saveFailed"), description: result.detail });
              }
            })
          }
          className="space-y-4"
        >
          {Object.entries(offer).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <input type="hidden" name="checkIn" value={stay.checkIn} />
          <input type="hidden" name="checkOut" value={stay.checkOut} />
          <input type="hidden" name="adults" value={stay.adults} />
          <input type="hidden" name="children" value={stay.children} />
          <input type="hidden" name="rooms" value={stay.rooms} />

          {openQuotations.length > 0 ? (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-ink">{t("existingQuotation")}</span>
              <select
                name="quotationId"
                defaultValue=""
                className="h-9 w-full cursor-pointer rounded-control border border-border bg-surface px-2.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
              >
                <option value="">{t("newQuotation")}</option>
                {openQuotations.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.title ? `${q.reference} — ${q.title}` : q.reference}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            // With nothing to add to, saying so beats an empty dropdown.
            <p className="rounded-control bg-surface-sunken px-3 py-2 text-sm text-ink-muted">
              {t("newQuotation")}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" size="sm" loading={pending}>
              {t("save")}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
