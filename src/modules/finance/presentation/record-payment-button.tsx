"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { LuBanknote } from "react-icons/lu";
import { useRouter } from "@/shared/i18n/navigation";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { recordPaymentAction } from "./finance-actions";

const METHODS = ["bank_transfer", "cheque", "cash", "adjustment"] as const;
const KINDS = ["receipt", "refund"] as const;

/**
 * Recording a payment (CLAUDE.md §10, §13 Phase 5b).
 *
 * The dialog says out loud that the entry is permanent, because it is: the
 * `payments` table refuses UPDATE and DELETE, and a correction is a second
 * entry in the opposite direction. Telling the user that before they submit is
 * cheaper than explaining it afterwards.
 */
export function RecordPaymentButton({
  agencyId,
  agencyName,
  today,
}: {
  agencyId: string;
  agencyName: string;
  /** Resolved on the server so the default is not the viewer's clock. */
  today: string;
}) {
  const t = useTranslations("finance");
  // Result keys are fully qualified ("<module>.errors.x"), so they resolve
  // against the ROOT translator — a namespaced one would look for
  // "<module>.<module>.errors.x" and print the key path instead.
  const tRoot = useTranslations();
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <LuBanknote aria-hidden />
        {t("recordPayment")}
      </Button>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={t("recordPaymentFor", { agency: agencyName })}
        description={t("recordPaymentDescription")}
        closeLabel={tCommon("cancel")}
        size="md"
      >
        <form
          action={(fd) =>
            startTransition(async () => {
              const result = await recordPaymentAction(fd);
              if (result.ok) {
                toast.success({ title: t("saved") });
                setOpen(false);
                router.refresh();
              } else {
                toast.error({ title: tRoot(result.errorKey), description: result.detail });
              }
            })
          }
          className="space-y-4"
        >
          <input type="hidden" name="agencyId" value={agencyId} />

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-ink">{t("kind")}</span>
              <select
                name="kind"
                defaultValue="receipt"
                className="h-9 w-full cursor-pointer rounded-control border border-border bg-surface px-2.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`kindOption.${k}`)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-ink">{t("method")}</span>
              <select
                name="method"
                defaultValue="bank_transfer"
                className="h-9 w-full cursor-pointer rounded-control border border-border bg-surface px-2.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {t(`methodOption.${m}`)}
                  </option>
                ))}
              </select>
            </label>

            <Input
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              required
              dir="ltr"
              label={t("amount")}
            />
            <Input
              name="paidOn"
              type="date"
              required
              dir="ltr"
              defaultValue={today}
              label={t("paidOn")}
            />
          </div>

          <Input name="externalReference" dir="ltr" label={t("externalReference")} />

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-ink">{t("notes")}</span>
            <textarea
              name="notes"
              rows={2}
              className="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
            />
          </label>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" size="sm" loading={pending}>
              {t("recordPayment")}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
