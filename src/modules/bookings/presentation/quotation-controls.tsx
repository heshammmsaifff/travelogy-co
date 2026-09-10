"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { LuTrash2 } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { useRouter } from "@/shared/i18n/navigation";
import { confirmAction } from "@/shared/lib/confirm";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  deleteQuotationAction,
  removeQuotationItemAction,
  setQuotationStatusAction,
  updateQuotationDetailsAction,
  type Result,
} from "./quotation-actions";

/** Shared toast handling so every control reports the same way. */
function useShow() {
  const t = useTranslations();
  return (result: Result) => {
    if (result.ok) toast.success({ title: t(result.messageKey) });
    else toast.error({ title: t(result.errorKey), description: result.detail });
    return result.ok;
  };
}

const NEXT_STATUS = {
  draft: ["sent", "expired"],
  sent: ["accepted", "expired"],
  accepted: ["draft"],
  expired: ["draft"],
} as const;

export function QuotationStatusControls({
  quotationId,
  status,
}: {
  quotationId: string;
  status: keyof typeof NEXT_STATUS;
}) {
  const t = useTranslations("quotations");
  const [pending, startTransition] = useTransition();
  const show = useShow();
  const router = useRouter();

  const label = { sent: "markSent", accepted: "markAccepted", expired: "markExpired", draft: "reopen" } as const;

  return (
    <div className="flex flex-wrap gap-2">
      {NEXT_STATUS[status].map((next) => (
        <Button
          key={next}
          size="sm"
          variant="secondary"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              if (show(await setQuotationStatusAction(quotationId, next))) router.refresh();
            })
          }
        >
          {t(label[next])}
        </Button>
      ))}
    </div>
  );
}

export function QuotationDetailsForm({
  quotationId,
  defaults,
}: {
  quotationId: string;
  defaults: { title: string; guestName: string; validUntil: string; notes: string };
}) {
  const t = useTranslations("quotations");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const show = useShow();
  const router = useRouter();

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          if (show(await updateQuotationDetailsAction(quotationId, fd))) router.refresh();
        })
      }
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          name="title"
          defaultValue={defaults.title}
          label={t("titleField")}
          placeholder={t("titlePlaceholder")}
        />
        <Input
          name="guestName"
          defaultValue={defaults.guestName}
          label={t("guestName")}
          placeholder={t("guestPlaceholder")}
        />
        <Input
          name="validUntil"
          type="date"
          dir="ltr"
          defaultValue={defaults.validUntil}
          label={t("validUntil")}
        />
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-ink">{t("notes")}</span>
        <textarea
          name="notes"
          rows={3}
          defaultValue={defaults.notes}
          placeholder={t("notesPlaceholder")}
          className="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
        />
      </label>

      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={pending}>
          {tCommon("save")}
        </Button>
      </div>
    </form>
  );
}

export function RemoveItemButton({
  quotationId,
  itemId,
  locale,
}: {
  quotationId: string;
  itemId: string;
  locale: Locale;
}) {
  const t = useTranslations("quotations");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const show = useShow();
  const router = useRouter();

  return (
    <Button
      variant="ghost"
      size="sm"
      loading={pending}
      aria-label={t("removeItem")}
      onClick={async () => {
        const confirmed = await confirmAction({
          title: t("removeItemConfirmTitle"),
          body: t("removeItemConfirmBody"),
          confirmLabel: tCommon("delete"),
          cancelLabel: tCommon("cancel"),
          dir: locale === "ar" ? "rtl" : "ltr",
        });
        if (!confirmed) return;
        startTransition(async () => {
          if (show(await removeQuotationItemAction(quotationId, itemId))) router.refresh();
        });
      }}
    >
      <LuTrash2 aria-hidden />
    </Button>
  );
}

export function DeleteQuotationButton({
  quotationId,
  locale,
}: {
  quotationId: string;
  locale: Locale;
}) {
  const t = useTranslations("quotations");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const show = useShow();
  const router = useRouter();

  return (
    <Button
      variant="danger"
      size="sm"
      loading={pending}
      onClick={async () => {
        // Deleting a quotation destroys the saved prices, so it asks first
        // rather than relying on an undo that does not exist (CLAUDE.md §3).
        const confirmed = await confirmAction({
          title: t("deleteConfirmTitle"),
          body: t("deleteConfirmBody"),
          confirmLabel: tCommon("delete"),
          cancelLabel: tCommon("cancel"),
          dir: locale === "ar" ? "rtl" : "ltr",
        });
        if (!confirmed) return;
        startTransition(async () => {
          if (show(await deleteQuotationAction(quotationId))) router.push("/agent/quotations");
        });
      }}
    >
      <LuTrash2 aria-hidden />
      {t("delete")}
    </Button>
  );
}
