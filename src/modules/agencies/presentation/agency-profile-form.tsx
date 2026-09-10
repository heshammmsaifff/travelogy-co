"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/shared/i18n/navigation";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { PhoneInput } from "@/shared/ui/phone-input";
import { updateAgencyProfileAction } from "./profile-actions";

export type AgencyProfileDefaults = {
  name: string;
  legalName: string;
  email: string;
  phone: string;
  website: string;
  city: string;
  address: string;
  commercialRegNo: string;
  taxId: string;
};

/**
 * The editable half of the company profile.
 *
 * Email is shown but not editable: it is the address the account signs in with
 * and the one approvals were sent to, so changing it is an account operation
 * rather than a profile edit. Marking it read-only is honest; hiding it would
 * leave the agent unable to check what we hold.
 */
export function AgencyProfileForm({ defaults }: { defaults: AgencyProfileDefaults }) {
  const t = useTranslations("profile");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const result = await updateAgencyProfileAction(fd);
          if (result.ok) {
            toast.success({ title: t("saved") });
            router.refresh();
          } else {
            toast.error({ title: t("errors.saveFailed"), description: result.detail });
          }
        })
      }
      className="space-y-6"
    >
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink">{t("sections.identityForm")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input name="name" required defaultValue={defaults.name} label={t("fields.name")} />
          <Input
            name="legalName"
            defaultValue={defaults.legalName}
            label={t("fields.legalName")}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink">{t("sections.contact")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            name="email"
            type="email"
            dir="ltr"
            defaultValue={defaults.email}
            label={t("fields.email")}
            hint={t("locked")}
            readOnly
            disabled
          />
          <PhoneInput name="phone" defaultValue={defaults.phone} label={t("fields.phone")} />
          <Input
            name="website"
            dir="ltr"
            defaultValue={defaults.website}
            label={t("fields.website")}
          />
          <Input name="city" defaultValue={defaults.city} label={t("fields.city")} />
          <Input name="address" defaultValue={defaults.address} label={t("fields.address")} />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink">{t("sections.legal")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            name="commercialRegNo"
            dir="ltr"
            defaultValue={defaults.commercialRegNo}
            label={t("fields.commercialRegNo")}
          />
          <Input name="taxId" dir="ltr" defaultValue={defaults.taxId} label={t("fields.taxId")} />
        </div>
      </fieldset>

      <div className="flex justify-end border-t border-border pt-4">
        <Button type="submit" loading={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
