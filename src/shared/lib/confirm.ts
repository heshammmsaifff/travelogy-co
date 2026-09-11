"use client";

import Swal from "sweetalert2";

/**
 * Blocking confirmation dialogs (CLAUDE.md §3: SweetAlert2 is reserved for
 * things that need explicit acknowledgement before an irreversible or
 * important action — delete a hotel, cancel a booking, suspend an agent).
 *
 * Everything else should be a toast. If you find yourself reaching for this to
 * report a routine success, use toast.success() instead.
 *
 * Styling comes from the @layer components block in globals.css, so these
 * dialogs inherit our design tokens rather than SweetAlert2's defaults.
 */

type ConfirmOptions = {
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Renders the confirm button in the danger colour. Default: true. */
  destructive?: boolean;
  /** Writing direction of the surrounding page, so the dialog matches it. */
  dir?: "rtl" | "ltr";
  icon?: "warning" | "question" | "info" | "success";
};

export async function confirmAction({
  title,
  body,
  confirmLabel,
  cancelLabel,
  destructive = true,
  dir = "ltr",
  icon,
}: ConfirmOptions): Promise<boolean> {
  const resolvedIcon = icon ?? (destructive ? "warning" : "question");
  const result = await Swal.fire({
    title,
    text: body,
    icon: resolvedIcon,
    iconColor: destructive
      ? "var(--color-danger-600, #dc2626)"
      : "var(--color-brand-600, #008080)",
    showCancelButton: true,
    confirmButtonText: confirmLabel,
    cancelButtonText: cancelLabel,
    // Cancel is focused by default so a stray Enter never destroys anything.
    focusCancel: true,
    reverseButtons: dir === "rtl",
    buttonsStyling: false,
    customClass: {
      popup: "swal2-custom-popup !rounded-2xl !p-6 !shadow-raised !border !border-border !bg-surface",
      title: "swal2-custom-title !text-lg !font-bold !text-ink !pt-1 !leading-snug",
      htmlContainer: "swal2-custom-html !text-sm !text-ink-muted !mt-2 !mb-4 !leading-relaxed",
      actions: "swal2-custom-actions !flex !items-center !justify-center !gap-3 !w-full !mt-3",
      confirmButton: destructive
        ? "swal2-confirm swal-confirm-danger !inline-flex !items-center !justify-center !h-9 !px-4 !text-sm !font-medium !rounded-control !bg-danger-600 !text-white hover:!bg-danger-700 active:!bg-danger-800 !shadow-sm !transition-colors !cursor-pointer !border-0"
        : "swal2-confirm !inline-flex !items-center !justify-center !h-9 !px-4 !text-sm !font-medium !rounded-control !bg-brand-600 !text-white hover:!bg-brand-700 active:!bg-brand-800 !shadow-sm !transition-colors !cursor-pointer !border-0",
      cancelButton:
        "swal2-cancel !inline-flex !items-center !justify-center !h-9 !px-4 !text-sm !font-medium !rounded-control !bg-surface !text-ink !border !border-border hover:!bg-surface-hover active:!bg-neutral-200 !shadow-xs !transition-colors !cursor-pointer",
    },
    didOpen: (popup) => {
      popup.setAttribute("dir", dir);
    },
  });

  return result.isConfirmed;
}
