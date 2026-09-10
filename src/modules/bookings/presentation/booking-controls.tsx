"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { LuCircleCheck, LuCircleX, LuFlagTriangleRight } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { useRouter } from "@/shared/i18n/navigation";
import { confirmAction } from "@/shared/lib/confirm";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import {
  cancelBookingAction,
  completeBookingAction,
  confirmBookingAction,
  type Result,
} from "./booking-actions";

function useShow() {
  const t = useTranslations();
  return (result: Result) => {
    if (result.ok) toast.success({ title: t(result.messageKey) });
    else toast.error({ title: t(result.errorKey), description: result.detail });
    return result.ok;
  };
}

/**
 * Booking state controls (CLAUDE.md §13, Phase 5a).
 *
 * Which buttons render is decided by the caller passing `canManage` — resolved
 * server-side from the real permission. Hiding a button is a convenience; the
 * database function re-checks and refuses regardless (§12).
 */
export function BookingControls({
  bookingId,
  status,
  canManage,
  canCancel,
  locale,
}: {
  bookingId: string;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  canManage: boolean;
  canCancel: boolean;
  locale: Locale;
}) {
  const t = useTranslations("bookings");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);
  const show = useShow();
  const router = useRouter();

  const dir = locale === "ar" ? "rtl" : "ltr";
  const settled = status === "cancelled" || status === "completed";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canManage && status === "pending" ? (
        <Button
          size="sm"
          loading={pending}
          onClick={async () => {
            const ok = await confirmAction({
              title: t("confirmConfirmTitle"),
              body: t("confirmConfirmBody"),
              confirmLabel: t("confirm"),
              cancelLabel: tCommon("cancel"),
              dir,
            });
            if (!ok) return;
            startTransition(async () => {
              if (show(await confirmBookingAction(bookingId))) router.refresh();
            });
          }}
        >
          <LuCircleCheck aria-hidden />
          {t("confirm")}
        </Button>
      ) : null}

      {canManage && status === "confirmed" ? (
        <Button
          size="sm"
          variant="secondary"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              if (show(await completeBookingAction(bookingId))) router.refresh();
            })
          }
        >
          <LuFlagTriangleRight aria-hidden />
          {t("complete")}
        </Button>
      ) : null}

      {canCancel && !settled ? (
        <Button size="sm" variant="danger" onClick={() => setCancelOpen(true)}>
          <LuCircleX aria-hidden />
          {t("cancel")}
        </Button>
      ) : null}

      {/* Cancelling asks for a reason rather than just a confirmation: the
          reason lands on the booking record and is what makes a later dispute
          answerable. */}
      <Modal
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={t("cancelConfirmTitle")}
        description={t("cancelConfirmBody")}
        closeLabel={tCommon("cancel")}
        size="md"
      >
        <form
          action={(fd) =>
            startTransition(async () => {
              const reason = String(fd.get("reason") ?? "");
              if (show(await cancelBookingAction(bookingId, reason))) {
                setCancelOpen(false);
                router.refresh();
              }
            })
          }
          className="space-y-4"
        >
          <Input name="reason" label={t("cancelReason")} placeholder={t("cancelReasonPlaceholder")} />
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="secondary" size="sm" onClick={() => setCancelOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" size="sm" variant="danger" loading={pending}>
              {t("cancel")}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
