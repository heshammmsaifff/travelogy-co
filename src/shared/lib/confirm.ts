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
};

export async function confirmAction({
  title,
  body,
  confirmLabel,
  cancelLabel,
  destructive = true,
  dir = "ltr",
}: ConfirmOptions): Promise<boolean> {
  const result = await Swal.fire({
    title,
    text: body,
    icon: destructive ? "warning" : "question",
    iconColor: destructive ? "oklch(0.672 0.152 65)" : "oklch(0.522 0.176 257)",
    showCancelButton: true,
    confirmButtonText: confirmLabel,
    cancelButtonText: cancelLabel,
    // Cancel is focused by default so a stray Enter never destroys anything.
    focusCancel: true,
    reverseButtons: dir === "rtl",
    buttonsStyling: false,
    customClass: {
      confirmButton: destructive ? "swal2-confirm swal-confirm-danger" : "swal2-confirm",
      cancelButton: "swal2-cancel",
    },
    didOpen: (popup) => {
      popup.setAttribute("dir", dir);
    },
  });

  return result.isConfirmed;
}
