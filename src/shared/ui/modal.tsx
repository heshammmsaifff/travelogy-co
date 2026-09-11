"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { LuX } from "react-icons/lu";
import { cn } from "@/shared/lib/cn";

/**
 * Modal built on Radix Dialog.
 *
 * Radix is doing the genuinely hard parts here — focus trapping, restoring
 * focus to the trigger on close, `aria-modal` wiring, Escape handling, scroll
 * lock and inert-ing the background. Those are easy to get subtly wrong by
 * hand, which is exactly why this is the one place we lean on a dependency.
 *
 * For a blocking *confirmation* (delete, cancel, suspend), use confirmAction()
 * from shared/lib/confirm instead — this component is for editing surfaces.
 */

export type ModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** Announced alongside the title; omit only when the body is self-evident. */
  description?: ReactNode;
  children: ReactNode;
  /** Action row pinned to the bottom of the dialog. */
  footer?: ReactNode;
  /** Accessible name for the close button, localised by the caller. */
  closeLabel: string;
  size?: "sm" | "md" | "lg";
};

const SIZES = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
} as const;

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  closeLabel,
  size = "md",
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          // Animations are defined in globals.css rather than pulled in via
          // tailwindcss-animate — two keyframes did not justify the dependency.
          className="fixed inset-0 z-50 bg-neutral-950/40 backdrop-blur-[2px] motion-safe:animate-overlay-in"
        />
        <Dialog.Content
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col",
            "rounded-modal border border-border bg-surface shadow-overlay",
            "focus:outline-none motion-safe:animate-modal-in",
            SIZES[size],
          )}
        >
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0 space-y-1">
              <Dialog.Title className="text-base font-semibold text-ink">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="text-sm text-ink-muted">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close
              className={cn(
                "-me-1 -mt-1 cursor-pointer rounded-control p-1.5 text-ink-subtle",
                "transition-colors hover:bg-surface-hover hover:text-ink",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              )}
            >
              <LuX className="size-4" aria-hidden />
              <span className="sr-only">{closeLabel}</span>
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 overscroll-contain">{children}</div>

          {footer ? (
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-surface-sunken px-5 py-3">
              {footer}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export const ModalTrigger = Dialog.Trigger;
export const ModalClose = Dialog.Close;
