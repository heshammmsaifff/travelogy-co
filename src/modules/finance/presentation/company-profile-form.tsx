"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/shared/i18n/navigation";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { PhoneInput } from "@/shared/ui/phone-input";
import { saveCompanyProfileAction } from "./finance-actions";
import type { CompanyProfile } from "@/modules/finance/infrastructure/finance.repository";

/** The issuing company printed on every document (CLAUDE.md §13, Phase 5c). */
export function CompanyProfileForm({ profile }: { profile: CompanyProfile }) {
  const t = useTranslations("companyProfile");
  // Result keys are fully qualified ("<module>.errors.x"), so they resolve
  // against the ROOT translator — a namespaced one would look for
  // "<module>.<module>.errors.x" and print the key path instead.
  const tRoot = useTranslations();
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const result = await saveCompanyProfileAction(fd);
          if (result.ok) {
            toast.success({ title: t("saved") });
            router.refresh();
          } else {
            toast.error({ title: tRoot(result.errorKey), description: result.detail });
          }
        })
      }
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          name="legalNameAr"
          required
          defaultValue={profile.legalNameAr}
          label={`${t("legalName")} (AR)`}
        />
        <Input
          name="legalNameEn"
          required
          dir="ltr"
          defaultValue={profile.legalNameEn}
          label={`${t("legalName")} (EN)`}
        />
        <Input
          name="addressAr"
          defaultValue={profile.addressAr ?? ""}
          label={`${t("address")} (AR)`}
        />
        <Input
          name="addressEn"
          dir="ltr"
          defaultValue={profile.addressEn ?? ""}
          label={`${t("address")} (EN)`}
        />
        <PhoneInput name="phone" defaultValue={profile.phone ?? ""} label={t("phone")} />
        <Input
          name="email"
          type="email"
          dir="ltr"
          defaultValue={profile.email ?? ""}
          label={t("email")}
        />
        <Input name="website" dir="ltr" defaultValue={profile.website ?? ""} label={t("website")} />
        <Input
          name="taxNumber"
          dir="ltr"
          defaultValue={profile.taxNumber ?? ""}
          label={t("taxNumber")}
        />
        <Input
          name="commercialRegNo"
          dir="ltr"
          defaultValue={profile.commercialRegNo ?? ""}
          label={t("commercialRegNo")}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-ink">{t("invoiceFooter")} (AR)</span>
          <textarea
            name="invoiceFooterAr"
            rows={3}
            defaultValue={profile.invoiceFooterAr ?? ""}
            className="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-ink">{t("invoiceFooter")} (EN)</span>
          <textarea
            name="invoiceFooterEn"
            rows={3}
            dir="ltr"
            defaultValue={profile.invoiceFooterEn ?? ""}
            className="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
          />
        </label>
      </div>

      <p className="text-xs text-ink-subtle">{t("invoiceFooterHint")}</p>

      <div className="flex justify-end border-t border-border pt-4">
        <Button type="submit" loading={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
