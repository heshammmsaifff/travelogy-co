"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import { LuPlus, LuTrash2 } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { confirmAction } from "@/shared/lib/confirm";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { NativeSelect } from "@/shared/ui/select";
import { Textarea as ShadcnTextarea } from "@/shared/ui/textarea";
import type { Result } from "./hotel-actions";

/**
 * Shared building blocks for the hotel back-office screens.
 *
 * Every form posts a plain FormData to a Server Action, so it works before
 * JavaScript loads and the same Zod schema validates it server-side (§12).
 */

export function useResultToast() {
  const t = useTranslations();
  return (result: Result) => {
    if (result.ok) toast.success({ title: t(result.messageKey) });
    else toast.error({ title: t(result.errorKey), description: result.detail });
    return result.ok;
  };
}

/** Labelled NativeSelect, matching Shadcn design tokens and gold focus ring. */
export function Select({
  name,
  label,
  hint,
  defaultValue,
  required,
  disabled,
  children,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultValue?: string;
  required?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <NativeSelect
      name={name}
      label={label}
      hint={hint}
      defaultValue={defaultValue}
      required={required}
      disabled={disabled}
    >
      {children}
    </NativeSelect>
  );
}

export function Checkbox({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-ink select-none">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="size-4.5 shrink-0 cursor-pointer rounded-sm border-border-strong accent-brand-600 focus-visible:ring-2 focus-visible:ring-gold-500"
      />
      {label}
    </label>
  );
}

export function Textarea({
  name,
  label,
  defaultValue,
  rows = 3,
  dir,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  rows?: number;
  dir?: "ltr" | "rtl";
}) {
  return (
    <ShadcnTextarea
      name={name}
      label={label}
      defaultValue={defaultValue}
      rows={rows}
      dir={dir}
    />
  );
}

/**
 * A modal wrapping a form that posts to a Server Action.
 *
 * Used for every "add / edit X" on the hotel screens, so the pattern —
 * validate, toast, close on success, stay open on failure — is written once.
 */
export function FormModal({
  open,
  onOpenChange,
  title,
  description,
  action,
  submitLabel,
  children,
  size = "lg",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  action: (fd: FormData) => Promise<Result>;
  submitLabel: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const show = useResultToast();

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      closeLabel={tCommon("cancel")}
      size={size}
    >
      <form
        action={(fd) =>
          startTransition(async () => {
            // Stays open on failure so the entered values are not lost.
            if (show(await action(fd))) onOpenChange(false);
          })
        }
        className="space-y-4"
      >
        {children}
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="submit" size="sm" loading={pending}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** "Add …" button that opens a FormModal. */
export function AddButton({
  label,
  title,
  description,
  action,
  children,
  size = "lg",
}: {
  label: string;
  title: string;
  description?: string;
  action: (fd: FormData) => Promise<Result>;
  children: ReactNode | ((close: () => void) => ReactNode);
  size?: "sm" | "md" | "lg";
}) {
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <LuPlus aria-hidden />
        {label}
      </Button>
      <FormModal
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        action={action}
        submitLabel={tCommon("save")}
        size={size}
      >
        {typeof children === "function" ? children(() => setOpen(false)) : children}
      </FormModal>
    </>
  );
}

/** Destructive row action with a blocking confirmation (CLAUDE.md §3). */
export function DeleteButton({
  onConfirm,
  locale,
  title,
  body,
  label,
}: {
  onConfirm: () => Promise<Result>;
  locale: Locale;
  title: string;
  body: string;
  label: string;
}) {
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const show = useResultToast();

  return (
    <Button
      variant="ghost"
      size="sm"
      loading={pending}
      aria-label={label}
      onClick={async () => {
        const confirmed = await confirmAction({
          title,
          body,
          confirmLabel: tCommon("delete"),
          cancelLabel: tCommon("cancel"),
          dir: locale === "ar" ? "rtl" : "ltr",
        });
        if (confirmed) startTransition(async () => void show(await onConfirm()));
      }}
    >
      <LuTrash2 aria-hidden />
    </Button>
  );
}

/** Inline form (not in a modal) posting to a Server Action. */
export function ActionForm({
  action,
  submitLabel,
  children,
  className,
}: {
  action: (fd: FormData) => Promise<Result>;
  submitLabel: string;
  children: ReactNode;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const show = useResultToast();

  return (
    <form
      action={(fd) => startTransition(async () => void show(await action(fd)))}
      className={className ?? "space-y-4"}
    >
      {children}
      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export { Input, Button };
