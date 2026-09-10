"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { LuBan, LuCheck, LuRotateCcw, LuX } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { confirmAction } from "@/shared/lib/confirm";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { CountrySelect } from "@/shared/ui/country-select";
import { Input } from "@/shared/ui/input";
import { PhoneInput } from "@/shared/ui/phone-input";
import { Modal } from "@/shared/ui/modal";
import {
  approveAgencyAction,
  rejectAgencyAction,
  setAgencyStatusAction,
  setCreditLimitAction,
  updateAgencyAction,
  type Result,
} from "./agency-actions";

function useResultToast() {
  const t = useTranslations();
  return (result: Result) => {
    if (result.ok) toast.success({ title: t(result.messageKey) });
    else toast.error({ title: t(result.errorKey), description: result.detail });
    return result.ok;
  };
}

/**
 * Approve / reject controls for a pending registration.
 *
 * Approving is confirmed with a blocking dialog because it activates a company
 * and its users; rejecting opens a modal because it requires a written reason
 * the applicant will be shown (CLAUDE.md §3).
 */
export function ApprovalControls({ agencyId, locale }: { agencyId: string; locale: Locale }) {
  const t = useTranslations("agencies.actions");
  const tCommon = useTranslations("common");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const show = useResultToast();
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          loading={pending}
          onClick={async () => {
            const confirmed = await confirmAction({
              title: t("approveConfirmTitle"),
              body: t("approveConfirmBody"),
              confirmLabel: t("approve"),
              cancelLabel: tCommon("cancel"),
              destructive: false,
              dir,
            });
            if (confirmed) {
              startTransition(async () => void show(await approveAgencyAction(agencyId)));
            }
          }}
        >
          <LuCheck aria-hidden />
          {t("approve")}
        </Button>

        <Button size="sm" variant="secondary" onClick={() => setRejectOpen(true)}>
          <LuX aria-hidden />
          {t("reject")}
        </Button>
      </div>

      <Modal
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title={t("rejectTitle")}
        description={t("rejectDescription")}
        closeLabel={tCommon("cancel")}
      >
        <form
          action={(fd) =>
            startTransition(async () => {
              if (show(await rejectAgencyAction(fd))) setRejectOpen(false);
            })
          }
          className="space-y-4"
        >
          <input type="hidden" name="agencyId" value={agencyId} />
          <Input name="reason" required label={t("rejectReason")} hint={t("rejectReasonHint")} />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setRejectOpen(false)}
            >
              {tCommon("cancel")}
            </Button>
            <Button type="submit" variant="danger" size="sm" loading={pending}>
              {t("reject")}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function SuspendControl({
  agencyId,
  status,
  locale,
}: {
  agencyId: string;
  status: string;
  locale: Locale;
}) {
  const t = useTranslations("agencies.actions");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const show = useResultToast();

  const suspending = status === "active";

  return (
    <Button
      size="sm"
      variant={suspending ? "danger" : "secondary"}
      loading={pending}
      onClick={async () => {
        if (suspending) {
          const confirmed = await confirmAction({
            title: t("suspendConfirmTitle"),
            // Spells out the consequence: suspension reaches every user of the
            // company, not just the company record.
            body: t("suspendConfirmBody"),
            confirmLabel: t("suspend"),
            cancelLabel: tCommon("cancel"),
            dir: locale === "ar" ? "rtl" : "ltr",
          });
          if (!confirmed) return;
        }
        startTransition(async () => {
          void show(await setAgencyStatusAction(agencyId, suspending ? "suspended" : "active"));
        });
      }}
    >
      {suspending ? <LuBan aria-hidden /> : <LuRotateCcw aria-hidden />}
      {suspending ? t("suspend") : t("reactivate")}
    </Button>
  );
}

export function CreditLimitForm({
  agencyId,
  creditLimit,
  currencyCode,
}: {
  agencyId: string;
  creditLimit: number;
  currencyCode: string;
}) {
  const t = useTranslations("agencies.credit");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const show = useResultToast();

  return (
    <form
      action={(fd) => startTransition(async () => void show(await setCreditLimitAction(fd)))}
      className="flex flex-wrap items-end gap-3"
    >
      <input type="hidden" name="agencyId" value={agencyId} />
      <div className="min-w-40 flex-1">
        <Input
          name="creditLimit"
          type="number"
          step="0.01"
          min="0"
          required
          dir="ltr"
          defaultValue={creditLimit}
          label={t("limitLabel", { currency: currencyCode })}
          hint={t("limitHint")}
        />
      </div>
      <Button type="submit" size="md" loading={pending}>
        {tCommon("save")}
      </Button>
    </form>
  );
}

export function AgencyProfileForm({
  agency,
}: {
  agency: {
    id: string;
    name: string;
    legalName: string | null;
    phone: string | null;
    website: string | null;
    countryCode: string;
    city: string | null;
    address: string | null;
    commercialRegNo: string | null;
    taxId: string | null;
  };
}) {
  const t = useTranslations("agencies.fields");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const show = useResultToast();

  return (
    <form
      action={(fd) => startTransition(async () => void show(await updateAgencyAction(fd)))}
      className="space-y-4"
    >
      <input type="hidden" name="agencyId" value={agency.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input name="name" required defaultValue={agency.name} label={t("name")} />
        <Input name="legalName" defaultValue={agency.legalName ?? ""} label={t("legalName")} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <PhoneInput name="phone" defaultValue={agency.phone ?? ""} label={t("phone")} />
        <Input name="website" dir="ltr" defaultValue={agency.website ?? ""} label={t("website")} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <CountrySelect
          name="countryCode"
          required
          defaultValue={agency.countryCode}
          label={t("countryCode")}
        />
        <Input name="city" defaultValue={agency.city ?? ""} label={t("city")} />
      </div>
      <Input name="address" defaultValue={agency.address ?? ""} label={t("address")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          name="commercialRegNo"
          defaultValue={agency.commercialRegNo ?? ""}
          label={t("commercialRegNo")}
        />
        <Input name="taxId" defaultValue={agency.taxId ?? ""} label={t("taxId")} />
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={pending}>
          {tCommon("save")}
        </Button>
      </div>
    </form>
  );
}
