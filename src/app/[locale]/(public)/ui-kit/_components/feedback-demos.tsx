"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { LuBell, LuTrash2 } from "react-icons/lu";
import { confirmAction } from "@/shared/lib/confirm";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";

/**
 * Live verification of the three feedback mechanisms CLAUDE.md §3 specifies:
 * sileo toasts (non-blocking), SweetAlert2 (blocking confirmation) and the
 * Radix-based Modal (editing surface).
 */

export function ToastDemos() {
  const t = useTranslations("devKitchenSink.toasts");

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        onClick={() => toast.success({ title: t("successTitle"), description: t("successBody") })}
      >
        <LuBell aria-hidden />
        {t("success")}
      </Button>

      <Button
        size="sm"
        variant="secondary"
        onClick={() => toast.error({ title: t("errorTitle"), description: t("errorBody") })}
      >
        {t("error")}
      </Button>

      <Button
        size="sm"
        variant="secondary"
        onClick={() => toast.warning({ title: t("warningTitle"), description: t("warningBody") })}
      >
        {t("warning")}
      </Button>

      <Button
        size="sm"
        variant="secondary"
        onClick={() => toast.info({ title: t("infoTitle"), description: t("infoBody") })}
      >
        {t("info")}
      </Button>

      <Button
        size="sm"
        variant="ghost"
        onClick={() =>
          // Stand-in for a real async mutation (e.g. booking creation in Phase 5).
          toast.promise(new Promise((resolve) => setTimeout(resolve, 1800)), {
            loading: { title: t("promiseLoading") },
            success: { title: t("promiseSuccess") },
            error: { title: t("promiseError") },
          })
        }
      >
        {t("promise")}
      </Button>
    </div>
  );
}

export function ConfirmDemo({ dir }: { dir: "rtl" | "ltr" }) {
  const t = useTranslations("devKitchenSink.dialogs");
  const tCommon = useTranslations("common");

  async function handleDelete() {
    const confirmed = await confirmAction({
      title: t("deleteTitle"),
      body: t("deleteBody"),
      confirmLabel: tCommon("delete"),
      cancelLabel: tCommon("cancel"),
      destructive: true,
      dir,
    });

    // Nothing is actually deleted here — this page has no data behind it.
    if (confirmed) {
      toast.success({ title: t("deleted") });
    } else {
      toast.info({ title: t("cancelled") });
    }
  }

  return (
    <Button variant="danger" size="sm" onClick={handleDelete}>
      <LuTrash2 aria-hidden />
      {t("deleteHotel")}
    </Button>
  );
}

export function ModalDemo() {
  const t = useTranslations("devKitchenSink.modal");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {t("open")}
      </Button>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={t("heading")}
        description={t("description")}
        closeLabel={t("close")}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setOpen(false);
                toast.success({ title: tCommon("save") });
              }}
            >
              {tCommon("save")}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">{t("body")}</p>
      </Modal>
    </>
  );
}
