"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { LuPencil } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { deleteRateAction, saveRateAction, saveRatePlanAction } from "./hotel-actions";
import { AddButton, Checkbox, DeleteButton, FormModal, Select } from "./hotel-forms";

type Room = { id: string; code: string; nameAr: string; nameEn: string };
type MealPlan = { key: string; nameAr: string; nameEn: string };
type Policy = { id: string; nameAr: string; nameEn: string };
type Plan = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  mealPlanKey: string;
  currencyCode: string;
  validFrom: string;
  validTo: string;
  status: string;
  cancellationPolicyId: string | null;
};
type Rate = {
  id: string;
  roomTypeId: string;
  dateFrom: string;
  dateTo: string;
  pricePerNight: number;
  extraAdultPrice: number;
  extraChildPrice: number;
  singleOccupancyPrice: number | null;
  minStay: number;
  maxStay: number | null;
  isClosed: boolean;
};

// ------------------------------------------------------------- rate plans

function PlanFields({
  hotelId,
  plan,
  mealPlans,
  policies,
  locale,
}: {
  hotelId: string;
  plan?: Plan;
  mealPlans: MealPlan[];
  policies: Policy[];
  locale: Locale;
}) {
  const t = useTranslations("hotels.plans.fields");
  const tStatus = useTranslations("hotels.plans.status");

  return (
    <>
      <input type="hidden" name="hotelId" value={hotelId} />
      {plan ? <input type="hidden" name="ratePlanId" value={plan.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Input
          name="code"
          required
          dir="ltr"
          maxLength={20}
          defaultValue={plan?.code}
          label={t("code")}
        />
        <Input name="nameAr" required defaultValue={plan?.nameAr} label={t("nameAr")} />
        <Input name="nameEn" required dir="ltr" defaultValue={plan?.nameEn} label={t("nameEn")} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Select
          name="mealPlanKey"
          required
          label={t("mealPlan")}
          defaultValue={plan?.mealPlanKey ?? "BB"}
        >
          {mealPlans.map((m) => (
            <option key={m.key} value={m.key}>
              {m.key} — {locale === "ar" ? m.nameAr : m.nameEn}
            </option>
          ))}
        </Select>
        <Input
          name="currencyCode"
          required
          dir="ltr"
          maxLength={3}
          defaultValue={plan?.currencyCode ?? "EGP"}
          label={t("currency")}
        />
        <Select name="status" required label={t("status")} defaultValue={plan?.status ?? "draft"}>
          {(["draft", "active", "inactive"] as const).map((s) => (
            <option key={s} value={s}>
              {tStatus(s)}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Input
          name="validFrom"
          type="date"
          required
          dir="ltr"
          defaultValue={plan?.validFrom}
          label={t("validFrom")}
        />
        <Input
          name="validTo"
          type="date"
          required
          dir="ltr"
          defaultValue={plan?.validTo}
          label={t("validTo")}
        />
        <Select
          name="cancellationPolicyId"
          label={t("cancellationPolicy")}
          defaultValue={plan?.cancellationPolicyId ?? ""}
        >
          <option value="">{t("noPolicy")}</option>
          {policies.map((p) => (
            <option key={p.id} value={p.id}>
              {locale === "ar" ? p.nameAr : p.nameEn}
            </option>
          ))}
        </Select>
      </div>
    </>
  );
}

export function AddPlanButton(props: {
  hotelId: string;
  mealPlans: MealPlan[];
  policies: Policy[];
  locale: Locale;
}) {
  const t = useTranslations("hotels.plans");
  return (
    <AddButton
      label={t("add")}
      title={t("addTitle")}
      description={t("addDescription")}
      action={saveRatePlanAction}
    >
      <PlanFields {...props} />
    </AddButton>
  );
}

export function EditPlanButton({
  plan,
  ...rest
}: {
  hotelId: string;
  plan: Plan;
  mealPlans: MealPlan[];
  policies: Policy[];
  locale: Locale;
}) {
  const t = useTranslations("hotels.plans");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        aria-label={t("editLabel", { code: plan.code })}
        onClick={() => setOpen(true)}
      >
        <LuPencil aria-hidden />
      </Button>
      <FormModal
        open={open}
        onOpenChange={setOpen}
        title={t("editTitle")}
        action={saveRatePlanAction}
        submitLabel={tCommon("save")}
      >
        <PlanFields plan={plan} {...rest} />
      </FormModal>
    </>
  );
}

// ------------------------------------------------------------------ rates

/**
 * Season fields.
 *
 * The two dates are the first and LAST night, which is how a contract is
 * written and how an admin thinks. The action converts that to the half-open
 * range Postgres stores, so consecutive seasons entered as Jun 1-30 and
 * Jul 1-31 meet exactly instead of colliding on the 30th.
 */
function RateFields({
  ratePlanId,
  rooms,
  rate,
  currency,
  locale,
}: {
  ratePlanId: string;
  rooms: Room[];
  rate?: Rate;
  currency: string;
  locale: Locale;
}) {
  const t = useTranslations("hotels.rates.fields");

  return (
    <>
      <input type="hidden" name="ratePlanId" value={ratePlanId} />
      {rate ? <input type="hidden" name="rateId" value={rate.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Select name="roomTypeId" required label={t("room")} defaultValue={rate?.roomTypeId}>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {locale === "ar" ? r.nameAr : r.nameEn} ({r.code})
            </option>
          ))}
        </Select>
        <Input
          name="dateFrom"
          type="date"
          required
          dir="ltr"
          defaultValue={rate?.dateFrom}
          label={t("dateFrom")}
        />
        <Input
          name="dateTo"
          type="date"
          required
          dir="ltr"
          defaultValue={rate?.dateTo}
          label={t("dateTo")}
          hint={t("dateToHint")}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Input
          name="pricePerNight"
          type="number"
          step="0.01"
          min="0"
          required
          dir="ltr"
          defaultValue={rate?.pricePerNight}
          label={t("pricePerNight", { currency })}
          hint={t("pricePerNightHint")}
        />
        <Input
          name="extraAdultPrice"
          type="number"
          step="0.01"
          min="0"
          dir="ltr"
          defaultValue={rate?.extraAdultPrice ?? 0}
          label={t("extraAdult")}
        />
        <Input
          name="extraChildPrice"
          type="number"
          step="0.01"
          min="0"
          dir="ltr"
          defaultValue={rate?.extraChildPrice ?? 0}
          label={t("extraChild")}
        />
        <Input
          name="singleOccupancyPrice"
          type="number"
          step="0.01"
          min="0"
          dir="ltr"
          defaultValue={rate?.singleOccupancyPrice ?? ""}
          label={t("singleOccupancy")}
          hint={t("singleOccupancyHint")}
        />
      </div>

      <div className="grid items-end gap-4 sm:grid-cols-3">
        <Input
          name="minStay"
          type="number"
          min={1}
          dir="ltr"
          defaultValue={rate?.minStay ?? 1}
          label={t("minStay")}
        />
        <Input
          name="maxStay"
          type="number"
          min={1}
          dir="ltr"
          defaultValue={rate?.maxStay ?? ""}
          label={t("maxStay")}
        />
        <div className="pb-2">
          <Checkbox name="isClosed" label={t("isClosed")} defaultChecked={rate?.isClosed} />
        </div>
      </div>
    </>
  );
}

export function AddRateButton({
  ratePlanId,
  hotelId,
  rooms,
  currency,
  locale,
}: {
  ratePlanId: string;
  hotelId: string;
  rooms: Room[];
  currency: string;
  locale: Locale;
}) {
  const t = useTranslations("hotels.rates");
  return (
    <AddButton
      label={t("add")}
      title={t("addTitle")}
      description={t("addDescription")}
      action={(fd) => saveRateAction(fd, hotelId)}
    >
      <RateFields ratePlanId={ratePlanId} rooms={rooms} currency={currency} locale={locale} />
    </AddButton>
  );
}

export function RateRowActions({
  rate,
  ratePlanId,
  hotelId,
  rooms,
  currency,
  locale,
}: {
  rate: Rate;
  ratePlanId: string;
  hotelId: string;
  rooms: Room[];
  currency: string;
  locale: Locale;
}) {
  const t = useTranslations("hotels.rates");
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
        action={(fd) => saveRateAction(fd, hotelId)}
        submitLabel={tCommon("save")}
      >
        <RateFields
          ratePlanId={ratePlanId}
          rooms={rooms}
          rate={rate}
          currency={currency}
          locale={locale}
        />
      </FormModal>
      <DeleteButton
        locale={locale}
        label={t("deleteLabel")}
        title={t("deleteConfirmTitle")}
        body={t("deleteConfirmBody")}
        onConfirm={() => deleteRateAction(rate.id, hotelId)}
      />
    </div>
  );
}

export function PlanStatusBadge({ status }: { status: string }) {
  const t = useTranslations("hotels.plans.status");
  const tone = status === "active" ? "success" : status === "draft" ? "neutral" : "warning";
  return <Badge tone={tone}>{t(status)}</Badge>;
}
