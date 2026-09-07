"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { LuPencil } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { CHARGE_TYPES, OFFER_TYPES } from "@/modules/hotels/application/schemas";
import { deleteOfferAction, saveOfferAction } from "./hotel-actions";
import { AddButton, Checkbox, DeleteButton, FormModal, Select, Textarea } from "./hotel-forms";

type Offer = {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  offerType: string;
  discountType: string;
  discountValue: number;
  stayFrom: string;
  stayTo: string;
  bookingFrom: string;
  bookingTo: string;
  minNights: number | null;
  freeNights: number | null;
  isActive: boolean;
};

function OfferFields({ hotelId, offer }: { hotelId: string; offer?: Offer }) {
  const t = useTranslations("hotels.offers.fields");
  const tType = useTranslations("hotels.offers.types");
  const tc = useTranslations("hotels.chargeType");

  return (
    <>
      <input type="hidden" name="hotelId" value={hotelId} />
      {offer ? <input type="hidden" name="offerId" value={offer.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Input name="nameAr" required defaultValue={offer?.nameAr} label={t("nameAr")} />
        <Input name="nameEn" required dir="ltr" defaultValue={offer?.nameEn} label={t("nameEn")} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Select
          name="offerType"
          required
          label={t("offerType")}
          defaultValue={offer?.offerType ?? "discount"}
        >
          {OFFER_TYPES.map((o) => (
            <option key={o} value={o}>
              {tType(o)}
            </option>
          ))}
        </Select>
        <Select
          name="discountType"
          required
          label={t("discountType")}
          defaultValue={offer?.discountType ?? "percentage"}
        >
          {CHARGE_TYPES.filter((c) => c !== "nights").map((c) => (
            <option key={c} value={c}>
              {tc(c)}
            </option>
          ))}
        </Select>
        <Input
          name="discountValue"
          type="number"
          step="0.01"
          min="0"
          required
          dir="ltr"
          defaultValue={offer?.discountValue}
          label={t("discountValue")}
        />
      </div>

      <fieldset className="rounded-control border border-border p-4">
        <legend className="px-1.5 text-xs font-semibold tracking-wide text-ink-muted uppercase">
          {t("stayLegend")}
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            name="stayFrom"
            type="date"
            required
            dir="ltr"
            defaultValue={offer?.stayFrom}
            label={t("stayFrom")}
          />
          <Input
            name="stayTo"
            type="date"
            required
            dir="ltr"
            defaultValue={offer?.stayTo}
            label={t("stayTo")}
          />
        </div>
      </fieldset>

      <fieldset className="rounded-control border border-border p-4">
        <legend className="px-1.5 text-xs font-semibold tracking-wide text-ink-muted uppercase">
          {t("bookingLegend")}
        </legend>
        {/* Optional: an early-bird offer needs it, a plain discount does not. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            name="bookingFrom"
            type="date"
            dir="ltr"
            defaultValue={offer?.bookingFrom}
            label={t("bookingFrom")}
          />
          <Input
            name="bookingTo"
            type="date"
            dir="ltr"
            defaultValue={offer?.bookingTo}
            label={t("bookingTo")}
          />
        </div>
      </fieldset>

      <div className="grid items-end gap-4 sm:grid-cols-3">
        <Input
          name="minNights"
          type="number"
          min={1}
          dir="ltr"
          defaultValue={offer?.minNights ?? ""}
          label={t("minNights")}
        />
        <Input
          name="freeNights"
          type="number"
          min={1}
          dir="ltr"
          defaultValue={offer?.freeNights ?? ""}
          label={t("freeNights")}
          hint={t("freeNightsHint")}
        />
        <div className="pb-2">
          <Checkbox
            name="isActive"
            label={t("isActive")}
            defaultChecked={offer?.isActive ?? true}
          />
        </div>
      </div>
    </>
  );
}

export function AddOfferButton({ hotelId }: { hotelId: string }) {
  const t = useTranslations("hotels.offers");
  return (
    <AddButton
      label={t("add")}
      title={t("addTitle")}
      description={t("addDescription")}
      action={saveOfferAction}
    >
      <OfferFields hotelId={hotelId} />
    </AddButton>
  );
}

export function OfferRowActions({
  offer,
  hotelId,
  locale,
}: {
  offer: Offer;
  hotelId: string;
  locale: Locale;
}) {
  const t = useTranslations("hotels.offers");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="ghost" size="sm" aria-label={t("editLabel")} onClick={() => setOpen(true)}>
        <LuPencil aria-hidden />
      </Button>
      <FormModal
        open={open}
        onOpenChange={setOpen}
        title={t("editTitle")}
        action={saveOfferAction}
        submitLabel={tCommon("save")}
      >
        <OfferFields hotelId={hotelId} offer={offer} />
      </FormModal>
      <DeleteButton
        locale={locale}
        label={t("deleteLabel")}
        title={t("deleteConfirmTitle")}
        body={t("deleteConfirmBody")}
        onConfirm={() => deleteOfferAction(offer.id, hotelId)}
      />
    </div>
  );
}

export { Textarea };
