"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { LuPencil } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import type { RoomTypeRow } from "@/modules/hotels/infrastructure/hotels.repository";
import { deleteRoomTypeAction, saveRoomTypeAction, setRoomStatusAction } from "./hotel-actions";
import { AddButton, DeleteButton, FormModal, Textarea, useResultToast } from "./hotel-forms";

/**
 * Room type fields, shared by the add and edit forms.
 *
 * The four occupancy numbers are grouped together and explained, because they
 * are the ones that decide pricing: `standardOccupancy` is what the nightly
 * rate covers, and anyone above it is charged the extra-guest price.
 */
function RoomFields({ hotelId, room }: { hotelId: string; room?: RoomTypeRow }) {
  const t = useTranslations("hotels.rooms.fields");

  return (
    <>
      <input type="hidden" name="hotelId" value={hotelId} />
      {room ? <input type="hidden" name="roomTypeId" value={room.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Input
          name="code"
          required
          dir="ltr"
          maxLength={20}
          defaultValue={room?.code}
          label={t("code")}
          hint={t("codeHint")}
        />
        <Input name="nameAr" required defaultValue={room?.nameAr} label={t("nameAr")} />
        <Input name="nameEn" required dir="ltr" defaultValue={room?.nameEn} label={t("nameEn")} />
      </div>

      <fieldset className="rounded-control border border-border p-4">
        <legend className="px-1.5 text-xs font-semibold tracking-wide text-ink-muted uppercase">
          {t("occupancyLegend")}
        </legend>
        <div className="grid gap-4 sm:grid-cols-4">
          <Input
            name="standardOccupancy"
            type="number"
            min={1}
            max={10}
            required
            dir="ltr"
            defaultValue={room?.standardOccupancy ?? 2}
            label={t("standardOccupancy")}
            hint={t("standardOccupancyHint")}
          />
          <Input
            name="maxAdults"
            type="number"
            min={1}
            max={10}
            required
            dir="ltr"
            defaultValue={room?.maxAdults ?? 2}
            label={t("maxAdults")}
          />
          <Input
            name="maxChildren"
            type="number"
            min={0}
            max={10}
            required
            dir="ltr"
            defaultValue={room?.maxChildren ?? 0}
            label={t("maxChildren")}
          />
          <Input
            name="maxOccupancy"
            type="number"
            min={1}
            max={20}
            required
            dir="ltr"
            defaultValue={room?.maxOccupancy ?? 3}
            label={t("maxOccupancy")}
            hint={t("maxOccupancyHint")}
          />
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <Input
          name="totalRooms"
          type="number"
          min={0}
          required
          dir="ltr"
          defaultValue={room?.totalRooms ?? 0}
          label={t("totalRooms")}
          hint={t("totalRoomsHint")}
        />
        <Input
          name="sizeSqm"
          type="number"
          min={1}
          dir="ltr"
          defaultValue={room?.sizeSqm ?? ""}
          label={t("sizeSqm")}
        />
        <Input
          name="bedConfigurationEn"
          dir="ltr"
          defaultValue={room?.bedConfigurationEn ?? ""}
          label={t("bedConfigurationEn")}
        />
      </div>

      <Input
        name="bedConfigurationAr"
        defaultValue={room?.bedConfigurationAr ?? ""}
        label={t("bedConfigurationAr")}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Textarea
          name="descriptionAr"
          defaultValue={room?.descriptionAr ?? ""}
          label={t("descriptionAr")}
        />
        <Textarea
          name="descriptionEn"
          dir="ltr"
          defaultValue={room?.descriptionEn ?? ""}
          label={t("descriptionEn")}
        />
      </div>
    </>
  );
}

export function AddRoomButton({ hotelId }: { hotelId: string }) {
  const t = useTranslations("hotels.rooms");
  return (
    <AddButton
      label={t("add")}
      title={t("addTitle")}
      description={t("addDescription")}
      action={saveRoomTypeAction}
    >
      <RoomFields hotelId={hotelId} />
    </AddButton>
  );
}

export function EditRoomButton({ hotelId, room }: { hotelId: string; room: RoomTypeRow }) {
  const t = useTranslations("hotels.rooms");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        aria-label={t("editLabel", { code: room.code })}
        onClick={() => setOpen(true)}
      >
        <LuPencil aria-hidden />
      </Button>
      <FormModal
        open={open}
        onOpenChange={setOpen}
        title={t("editTitle")}
        action={saveRoomTypeAction}
        submitLabel={tCommon("save")}
      >
        <RoomFields hotelId={hotelId} room={room} />
      </FormModal>
    </>
  );
}

export function RoomRowActions({
  hotelId,
  room,
  locale,
}: {
  hotelId: string;
  room: RoomTypeRow;
  locale: Locale;
}) {
  const t = useTranslations("hotels.rooms");
  const [pending, startTransition] = useTransition();
  const show = useResultToast();

  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            void show(
              await setRoomStatusAction(
                room.id,
                hotelId,
                room.status === "active" ? "inactive" : "active",
              ),
            );
          })
        }
      >
        {room.status === "active" ? t("deactivate") : t("activate")}
      </Button>
      <EditRoomButton hotelId={hotelId} room={room} />
      <DeleteButton
        locale={locale}
        label={t("deleteLabel", { code: room.code })}
        title={t("deleteConfirmTitle")}
        body={t("deleteConfirmBody")}
        onConfirm={() => deleteRoomTypeAction(room.id, hotelId)}
      />
    </div>
  );
}
