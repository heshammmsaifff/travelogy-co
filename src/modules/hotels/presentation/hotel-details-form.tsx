"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LuBan, LuGlobe, LuPlus, LuSend } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { confirmAction } from "@/shared/lib/confirm";
import { Button } from "@/shared/ui/button";
import { CountrySelect } from "@/shared/ui/country-select";
import { Input } from "@/shared/ui/input";
import { PhoneInput } from "@/shared/ui/phone-input";
import { LocationField } from "./location-field";
import { Modal } from "@/shared/ui/modal";
import { PROPERTY_TYPES } from "@/modules/hotels/application/schemas";
import {
  createHotelAction,
  setAmenitiesAction,
  setHotelStatusAction,
  updateHotelAction,
} from "./hotel-actions";
import { ActionForm, Checkbox, Select, Textarea, useResultToast } from "./hotel-forms";

type Hotel = Awaited<ReturnType<typeof import("../infrastructure/hotels.repository").getHotel>>;

/**
 * The property form, used for both creating and editing.
 *
 * Bilingual fields sit side by side rather than behind a language tab: an
 * admin entering a hotel has both names to hand at once, and a tab makes it
 * easy to save with one language silently empty (§5).
 */
function DetailFields({ hotel }: { hotel?: NonNullable<Hotel> }) {
  const t = useTranslations("hotels.fields");
  const tType = useTranslations("hotels.propertyType");

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input name="nameAr" required defaultValue={hotel?.nameAr} label={t("nameAr")} />
        <Input name="nameEn" required dir="ltr" defaultValue={hotel?.nameEn} label={t("nameEn")} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Select
          name="propertyType"
          required
          label={t("propertyType")}
          defaultValue={hotel?.propertyType ?? "hotel"}
        >
          {PROPERTY_TYPES.map((p) => (
            <option key={p} value={p}>
              {tType(p)}
            </option>
          ))}
        </Select>
        <Input
          name="starRating"
          type="number"
          min={1}
          max={7}
          dir="ltr"
          defaultValue={hotel?.starRating ?? ""}
          label={t("starRating")}
          hint={t("starRatingHint")}
        />
        <CountrySelect
          name="countryCode"
          required
          defaultValue={hotel?.countryCode ?? "EG"}
          label={t("countryCode")}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input name="cityAr" required defaultValue={hotel?.cityAr} label={t("cityAr")} />
        <Input name="cityEn" required dir="ltr" defaultValue={hotel?.cityEn} label={t("cityEn")} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input name="areaAr" defaultValue={hotel?.areaAr ?? ""} label={t("areaAr")} />
        <Input name="areaEn" dir="ltr" defaultValue={hotel?.areaEn ?? ""} label={t("areaEn")} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input name="addressAr" defaultValue={hotel?.addressAr ?? ""} label={t("addressAr")} />
        <Input
          name="addressEn"
          dir="ltr"
          defaultValue={hotel?.addressEn ?? ""}
          label={t("addressEn")}
        />
      </div>

      <LocationField
        defaultValue={hotel?.locationUrl}
        latitude={hotel?.latitude}
        longitude={hotel?.longitude}
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <Input
          name="checkInTime"
          type="time"
          required
          dir="ltr"
          defaultValue={hotel?.checkInTime ?? "14:00"}
          label={t("checkIn")}
        />
        <Input
          name="checkOutTime"
          type="time"
          required
          dir="ltr"
          defaultValue={hotel?.checkOutTime ?? "12:00"}
          label={t("checkOut")}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <PhoneInput name="phone" defaultValue={hotel?.phone ?? ""} label={t("phone")} />
        <Input
          name="email"
          type="email"
          dir="ltr"
          defaultValue={hotel?.email ?? ""}
          label={t("email")}
        />
        <Input name="website" dir="ltr" defaultValue={hotel?.website ?? ""} label={t("website")} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Textarea
          name="descriptionAr"
          defaultValue={hotel?.descriptionAr ?? ""}
          label={t("descriptionAr")}
        />
        <Textarea
          name="descriptionEn"
          dir="ltr"
          defaultValue={hotel?.descriptionEn ?? ""}
          label={t("descriptionEn")}
        />
      </div>

      <Textarea
        name="internalNotes"
        rows={2}
        defaultValue={hotel?.internalNotes ?? ""}
        label={t("internalNotes")}
      />
    </>
  );
}

export function CreateHotelButton({ locale }: { locale: Locale }) {
  const t = useTranslations("hotels");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const show = useResultToast();
  const router = useRouter();

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <LuPlus aria-hidden />
        {t("create")}
      </Button>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={t("createTitle")}
        description={t("createDescription")}
        closeLabel={tCommon("cancel")}
        size="lg"
      >
        <form
          action={(fd) =>
            startTransition(async () => {
              const result = await createHotelAction(fd);
              if (show(result) && result.ok && result.id) {
                setOpen(false);
                // Straight into the new property: it starts as a draft with no
                // rooms or rates, so the list would be a dead end.
                router.push(`/${locale}/admin/hotels/${result.id}`);
              }
            })
          }
          className="space-y-4"
        >
          <DetailFields />
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" size="sm" loading={pending}>
              {t("create")}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function HotelDetailsForm({ hotel }: { hotel: NonNullable<Hotel> }) {
  const tCommon = useTranslations("common");
  return (
    <ActionForm action={updateHotelAction} submitLabel={tCommon("save")}>
      <input type="hidden" name="hotelId" value={hotel.id} />
      <DetailFields hotel={hotel} />
    </ActionForm>
  );
}

export function AmenitiesForm({
  hotelId,
  groups,
  selected,
  locale,
}: {
  hotelId: string;
  groups: [string, { key: string; nameAr: string; nameEn: string }[]][];
  selected: string[];
  locale: Locale;
}) {
  const t = useTranslations("hotels.amenities");
  const tCommon = useTranslations("common");
  const selectedSet = new Set(selected);

  return (
    <ActionForm action={setAmenitiesAction} submitLabel={tCommon("save")}>
      <input type="hidden" name="hotelId" value={hotelId} />
      <div className="space-y-4">
        {groups.map(([category, items]) => (
          <fieldset key={category} className="rounded-control border border-border p-4">
            <legend className="px-1.5 text-xs font-semibold tracking-wide text-ink-muted uppercase">
              {t(`categories.${category}`)}
            </legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {items.map((a) => (
                <label
                  key={a.key}
                  className="flex cursor-pointer items-center gap-2.5 rounded-control p-1.5 text-sm text-ink hover:bg-surface-hover"
                >
                  <input
                    type="checkbox"
                    name="amenities"
                    value={a.key}
                    defaultChecked={selectedSet.has(a.key)}
                    className="size-4 shrink-0 cursor-pointer rounded-[4px] border-border-strong accent-brand-600"
                  />
                  {locale === "ar" ? a.nameAr : a.nameEn}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </ActionForm>
  );
}

/**
 * Publish / withdraw.
 *
 * Publishing is blocked server-side when the hotel has no active rooms; the
 * button is still shown so the admin learns *why* rather than wondering where
 * the control went.
 */
export function HotelStatusControls({
  hotelId,
  status,
  locale,
}: {
  hotelId: string;
  status: string;
  locale: Locale;
}) {
  const t = useTranslations("hotels.status");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const show = useResultToast();
  const dir = locale === "ar" ? "rtl" : "ltr";

  const run = (next: "active" | "inactive") =>
    startTransition(async () => void show(await setHotelStatusAction(hotelId, next)));

  if (status === "active") {
    return (
      <Button
        variant="secondary"
        size="sm"
        loading={pending}
        onClick={async () => {
          const confirmed = await confirmAction({
            title: t("withdrawConfirmTitle"),
            body: t("withdrawConfirmBody"),
            confirmLabel: t("withdraw"),
            cancelLabel: tCommon("cancel"),
            dir,
          });
          if (confirmed) run("inactive");
        }}
      >
        <LuBan aria-hidden />
        {t("withdraw")}
      </Button>
    );
  }

  return (
    <Button size="sm" loading={pending} onClick={() => run("active")}>
      {status === "draft" ? <LuSend aria-hidden /> : <LuGlobe aria-hidden />}
      {t("publish")}
    </Button>
  );
}

export { Checkbox };
