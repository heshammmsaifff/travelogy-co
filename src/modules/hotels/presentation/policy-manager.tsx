"use client";

import { useTranslations } from "next-intl";
import type { Locale } from "@/shared/i18n/config";
import { Input } from "@/shared/ui/input";
import {
  addCancellationRuleAction,
  deleteCancellationRuleAction,
  deleteChildPolicyAction,
  saveCancellationPolicyAction,
  saveChildPolicyAction,
} from "./hotel-actions";
import { AddButton, Checkbox, DeleteButton, Select, Textarea } from "./hotel-forms";
import { CHARGE_TYPES } from "@/modules/hotels/application/schemas";

/** Cancellation and child-age policies. */

export function AddCancellationPolicyButton({ hotelId }: { hotelId: string }) {
  const t = useTranslations("hotels.policies");
  const tf = useTranslations("hotels.policies.fields");

  return (
    <AddButton
      label={t("addPolicy")}
      title={t("addPolicyTitle")}
      description={t("addPolicyDescription")}
      action={saveCancellationPolicyAction}
      size="md"
    >
      <input type="hidden" name="hotelId" value={hotelId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input name="nameAr" required label={tf("nameAr")} />
        <Input name="nameEn" required dir="ltr" label={tf("nameEn")} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Textarea name="descriptionAr" rows={2} label={tf("descriptionAr")} />
        <Textarea name="descriptionEn" rows={2} dir="ltr" label={tf("descriptionEn")} />
      </div>
      {/* A non-refundable policy carries no tiers — the whole booking is
          forfeit regardless of when it is cancelled. */}
      <Checkbox name="isNonRefundable" label={tf("nonRefundable")} />
    </AddButton>
  );
}

export function AddCancellationRuleButton({
  policyId,
  hotelId,
}: {
  policyId: string;
  hotelId: string;
}) {
  const t = useTranslations("hotels.policies");
  const tf = useTranslations("hotels.policies.fields");
  const tc = useTranslations("hotels.chargeType");

  return (
    <AddButton
      label={t("addRule")}
      title={t("addRuleTitle")}
      description={t("addRuleDescription")}
      action={(fd) => addCancellationRuleAction(fd, hotelId)}
      size="md"
    >
      <input type="hidden" name="policyId" value={policyId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Input
          name="hoursBeforeCheckin"
          type="number"
          min={0}
          required
          dir="ltr"
          label={tf("hoursBefore")}
          hint={tf("hoursBeforeHint")}
        />
        <Select name="chargeType" required label={tf("chargeType")} defaultValue="percentage">
          {CHARGE_TYPES.map((c) => (
            <option key={c} value={c}>
              {tc(c)}
            </option>
          ))}
        </Select>
        <Input
          name="chargeValue"
          type="number"
          step="0.01"
          min="0"
          required
          dir="ltr"
          label={tf("chargeValue")}
        />
      </div>
    </AddButton>
  );
}

export function DeleteRuleButton({
  ruleId,
  hotelId,
  locale,
}: {
  ruleId: string;
  hotelId: string;
  locale: Locale;
}) {
  const t = useTranslations("hotels.policies");
  return (
    <DeleteButton
      locale={locale}
      label={t("deleteRuleLabel")}
      title={t("deleteRuleConfirmTitle")}
      body={t("deleteRuleConfirmBody")}
      onConfirm={() => deleteCancellationRuleAction(ruleId, hotelId)}
    />
  );
}

export function AddChildPolicyButton({ hotelId }: { hotelId: string }) {
  const t = useTranslations("hotels.childPolicies");
  const tf = useTranslations("hotels.childPolicies.fields");
  const tc = useTranslations("hotels.chargeType");

  return (
    <AddButton
      label={t("add")}
      title={t("addTitle")}
      description={t("addDescription")}
      action={saveChildPolicyAction}
      size="md"
    >
      <input type="hidden" name="hotelId" value={hotelId} />
      <div className="grid gap-4 sm:grid-cols-4">
        <Input
          name="ageFrom"
          type="number"
          min={0}
          max={17}
          required
          dir="ltr"
          label={tf("ageFrom")}
        />
        <Input name="ageTo" type="number" min={0} max={17} required dir="ltr" label={tf("ageTo")} />
        <Select name="chargeType" required label={tf("chargeType")} defaultValue="percentage">
          {CHARGE_TYPES.map((c) => (
            <option key={c} value={c}>
              {tc(c)}
            </option>
          ))}
        </Select>
        <Input
          name="chargeValue"
          type="number"
          step="0.01"
          min="0"
          required
          dir="ltr"
          defaultValue={0}
          label={tf("chargeValue")}
          hint={tf("chargeValueHint")}
        />
      </div>
    </AddButton>
  );
}

export function DeleteChildPolicyButton({
  policyId,
  hotelId,
  locale,
}: {
  policyId: string;
  hotelId: string;
  locale: Locale;
}) {
  const t = useTranslations("hotels.childPolicies");
  return (
    <DeleteButton
      locale={locale}
      label={t("deleteLabel")}
      title={t("deleteConfirmTitle")}
      body={t("deleteConfirmBody")}
      onConfirm={() => deleteChildPolicyAction(policyId, hotelId)}
    />
  );
}
