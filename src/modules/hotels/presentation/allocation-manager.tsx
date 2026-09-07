"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { LuBan, LuCalendarPlus } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { formatNumber } from "@/shared/lib/format";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import type { AllocationCell } from "@/modules/hotels/infrastructure/hotels.repository";
import { setAllocationAction } from "./hotel-actions";
import { Checkbox, Select, useResultToast } from "./hotel-forms";

/**
 * Allocation calendar.
 *
 * Contracts are negotiated in blocks ("20 rooms, June to September"), so the
 * bulk form is the primary way this is entered. The grid below shows what
 * actually landed per night, which is where a single-night stop-sell or a
 * weekend-only allotment becomes visible.
 */
export function AllocationManager({
  hotelId,
  rooms,
  selectedRoomId,
  cells,
  fromDate,
  toDate,
  locale,
  canManage,
}: {
  hotelId: string;
  rooms: { id: string; code: string; nameAr: string; nameEn: string; totalRooms: number }[];
  selectedRoomId: string | null;
  cells: AllocationCell[];
  fromDate: string;
  toDate: string;
  locale: Locale;
  canManage: boolean;
}) {
  const t = useTranslations("hotels.allocation");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const show = useResultToast();

  const byDate = new Map(cells.map((c) => [c.date, c]));
  const room = rooms.find((r) => r.id === selectedRoomId);

  // Every night in the window, whether or not a row exists — a date with no
  // allocation row is genuinely "not loaded", and hiding it would make an
  // unsold gap look the same as a sold-out one.
  const days: string[] = [];
  const cursor = new Date(`${fromDate}T00:00:00Z`);
  const end = new Date(`${toDate}T00:00:00Z`);
  while (cursor <= end && days.length < 400) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const weekdayNames = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    weekday: "short",
    timeZone: "UTC",
  });
  const dayNumber = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });

  return (
    <div className="space-y-4">
      {/* Room + window picker. A GET form, so the view is shareable. */}
      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-64">
          <Select name="room" label={t("room")} defaultValue={selectedRoomId ?? ""} required>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {locale === "ar" ? r.nameAr : r.nameEn} ({r.code})
              </option>
            ))}
          </Select>
        </div>
        <Input name="from" type="date" dir="ltr" defaultValue={fromDate} label={t("from")} />
        <Input name="to" type="date" dir="ltr" defaultValue={toDate} label={t("to")} />
        <button
          type="submit"
          className="h-9 cursor-pointer rounded-control border border-border-strong bg-surface px-3.5 text-sm font-medium text-ink transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {t("show")}
        </button>

        {canManage && selectedRoomId ? (
          <Button type="button" size="md" onClick={() => setOpen(true)}>
            <LuCalendarPlus aria-hidden />
            {t("setRange")}
          </Button>
        ) : null}
      </form>

      {!selectedRoomId ? (
        <p className="rounded-card border border-dashed border-border-strong p-8 text-center text-sm text-ink-muted">
          {t("pickRoom")}
        </p>
      ) : (
        <>
          {room ? (
            <p className="text-xs text-ink-muted">
              {t("physicalRooms", { count: formatNumber(room.totalRooms, locale) })}
            </p>
          ) : null}

          <ul className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1.5">
            {days.map((date) => {
              const cell = byDate.get(date);
              const remaining = cell ? cell.allotment - cell.sold : 0;
              const d = new Date(`${date}T00:00:00Z`);

              return (
                <li
                  key={date}
                  className={cn(
                    "rounded-control border p-2 text-center",
                    !cell
                      ? "border-dashed border-border-strong bg-surface-sunken"
                      : cell.stopSell
                        ? "border-danger-100 bg-danger-50"
                        : remaining === 0
                          ? "border-warning-100 bg-warning-50"
                          : "border-border bg-surface",
                  )}
                >
                  <span className="block text-2xs text-ink-subtle">{weekdayNames.format(d)}</span>
                  <span className="block text-2xs text-ink-muted" dir="ltr">
                    {dayNumber.format(d)}
                  </span>
                  <span
                    className={cn(
                      "mt-1 block text-sm font-semibold tabular-nums",
                      !cell
                        ? "text-ink-subtle"
                        : cell.stopSell
                          ? "text-danger-700"
                          : remaining === 0
                            ? "text-warning-700"
                            : "text-ink",
                    )}
                  >
                    {!cell ? (
                      "—"
                    ) : cell.stopSell ? (
                      <LuBan className="mx-auto size-3.5" aria-hidden />
                    ) : (
                      formatNumber(remaining, locale)
                    )}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap gap-4 text-2xs text-ink-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm border border-dashed border-border-strong bg-surface-sunken" />
              {t("legendNone")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm border border-border bg-surface" />
              {t("legendAvailable")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm border border-warning-100 bg-warning-50" />
              {t("legendFull")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm border border-danger-100 bg-danger-50" />
              {t("legendStopSell")}
            </span>
          </div>
        </>
      )}

      {canManage && selectedRoomId ? (
        <Modal
          open={open}
          onOpenChange={setOpen}
          title={t("setRangeTitle")}
          description={t("setRangeDescription")}
          closeLabel={tCommon("cancel")}
        >
          <form
            action={(fd) =>
              startTransition(async () => {
                if (show(await setAllocationAction(fd, hotelId))) setOpen(false);
              })
            }
            className="space-y-4"
          >
            <input type="hidden" name="roomTypeId" value={selectedRoomId} />

            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                name="dateFrom"
                type="date"
                required
                dir="ltr"
                defaultValue={fromDate}
                label={t("from")}
              />
              <Input
                name="dateTo"
                type="date"
                required
                dir="ltr"
                defaultValue={toDate}
                label={t("to")}
              />
              <Input
                name="allotment"
                type="number"
                min={0}
                required
                dir="ltr"
                label={t("allotment")}
                hint={t("allotmentHint")}
              />
            </div>

            <fieldset className="rounded-control border border-border p-4">
              <legend className="px-1.5 text-xs font-semibold tracking-wide text-ink-muted uppercase">
                {t("weekdays")}
              </legend>
              <p className="mb-2 text-xs text-ink-muted">{t("weekdaysHint")}</p>
              <div className="flex flex-wrap gap-3">
                {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                  <label
                    key={day}
                    className="flex cursor-pointer items-center gap-1.5 text-sm text-ink"
                  >
                    <input
                      type="checkbox"
                      name="weekdays"
                      value={day}
                      className="size-4 cursor-pointer rounded-[4px] border-border-strong accent-brand-600"
                    />
                    {weekdayNames.format(new Date(Date.UTC(2026, 0, 4 + day)))}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid items-end gap-4 sm:grid-cols-2">
              <Input name="minStay" type="number" min={1} dir="ltr" label={t("minStay")} />
              <div className="pb-2">
                <Checkbox name="stopSell" label={t("stopSell")} />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="submit" size="sm" loading={pending}>
                {tCommon("save")}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
