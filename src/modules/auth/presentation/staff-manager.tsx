"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { LuCopy, LuPlus, LuTriangleAlert } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { confirmAction } from "@/shared/lib/confirm";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { NativeSelect, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import type { RoleSummary, StaffRow } from "@/modules/auth/infrastructure/access.repository";
import {
  createStaffAction,
  setStaffRoleAction,
  setStaffStatusAction,
  type Result,
} from "./access-actions";

function useResultToast() {
  const t = useTranslations();
  return (result: Result) => {
    if (result.ok) toast.success({ title: t(result.messageKey) });
    else toast.error({ title: t(result.errorKey), description: result.detail });
    return result.ok;
  };
}

/**
 * Create a back-office account.
 *
 * The generated temporary password is shown once, in a panel the admin has to
 * dismiss, because it is never recoverable afterwards. That is a deliberate
 * trade: an emailed invite would be nicer, but this project's Supabase SMTP is
 * rate-limited to a handful of messages an hour, so an invite flow would fail
 * silently for real use. Recorded in CLAUDE.md §15.
 */
export function CreateStaffButton({ roles }: { roles: RoleSummary[] }) {
  const locale = useLocale();
  const t = useTranslations("access.staff");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const show = useResultToast();

  // super_admin is excluded: only an existing super admin can mint another,
  // and that is a deliberate promotion, not an account-creation option.
  const assignable = roles.filter((r) => r.scope === "admin" && r.key !== "super_admin");

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <LuPlus aria-hidden />
        {t("create")}
      </Button>

      <Modal
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSecret(null);
        }}
        title={secret ? t("createdTitle") : t("createTitle")}
        description={secret ? undefined : t("createDescription")}
        closeLabel={tCommon("cancel")}
      >
        {secret ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-control bg-warning-50 p-4">
              <LuTriangleAlert className="mt-0.5 size-5 shrink-0 text-warning-600" aria-hidden />
              <p className="text-sm text-ink">{t("secretWarning")}</p>
            </div>

            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">{t("fields.email")}</dt>
                <dd className="font-medium text-ink" dir="ltr">
                  {secret.email}
                </dd>
              </div>
            </dl>

            <div className="flex items-center gap-2 rounded-control border border-border bg-surface-sunken p-3">
              <code className="min-w-0 flex-1 truncate font-mono text-sm text-ink" dir="ltr">
                {secret.password}
              </code>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(secret.password);
                    toast.success({ title: t("copied") });
                  } catch {
                    // Clipboard access can be blocked; the value is on screen
                    // to select manually, so this is not a failure worth alarm.
                    toast.info({ title: t("copyManually") });
                  }
                }}
              >
                <LuCopy aria-hidden />
                {t("copy")}
              </Button>
            </div>

            <Button
              className="w-full"
              onClick={() => {
                setSecret(null);
                setOpen(false);
              }}
            >
              {t("secretAcknowledge")}
            </Button>
          </div>
        ) : (
          <form
            action={(fd) =>
              startTransition(async () => {
                const result = await createStaffAction(fd);
                if (show(result) && result.ok && result.secret) {
                  setSecret({ email: String(fd.get("email")), password: result.secret });
                }
              })
            }
            className="space-y-4"
          >
            <Input name="fullName" required label={t("fields.fullName")} />
            <Input name="email" type="email" required dir="ltr" label={t("fields.email")} />

            <NativeSelect
              id="staff-role"
              name="roleId"
              required
              defaultValue=""
              label={t("fields.role")}
            >
              <option value="" disabled>
                {t("selectRole")}
              </option>
              {assignable.map((r) => (
                <option key={r.id} value={r.id}>
                  {locale === "ar" ? r.nameAr : r.nameEn}
                </option>
              ))}
            </NativeSelect>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="submit" size="sm" loading={pending}>
                {t("create")}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

export function StaffStatusButton({ staff, locale }: { staff: StaffRow; locale: Locale }) {
  const t = useTranslations("access.staff");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const show = useResultToast();

  const suspending = staff.status === "active";

  return (
    <Button
      size="sm"
      variant={suspending ? "ghost" : "secondary"}
      loading={pending}
      onClick={async () => {
        // Suspending someone locks them out; that warrants a blocking
        // confirmation. Reactivating does not (CLAUDE.md §3).
        if (suspending) {
          const confirmed = await confirmAction({
            title: t("suspendConfirmTitle"),
            body: t("suspendConfirmBody", { name: staff.fullName || staff.email }),
            confirmLabel: t("suspend"),
            cancelLabel: tCommon("cancel"),
            dir: locale === "ar" ? "rtl" : "ltr",
          });
          if (!confirmed) return;
        }
        startTransition(async () => {
          void show(await setStaffStatusAction(staff.id, suspending ? "suspended" : "active"));
        });
      }}
    >
      {suspending ? t("suspend") : t("reactivate")}
    </Button>
  );
}

export function StaffRoleSelect({
  staff,
  roles,
  disabled,
}: {
  staff: StaffRow;
  roles: RoleSummary[];
  disabled?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("access.staff");
  const [pending, startTransition] = useTransition();
  const show = useResultToast();

  const assignable = roles.filter((r) => r.scope === "admin");

  return (
    <Select
      defaultValue={staff.roleId}
      disabled={disabled || pending}
      onValueChange={(val) =>
        startTransition(async () => void show(await setStaffRoleAction(staff.id, val)))
      }
    >
      <SelectTrigger
        aria-label={t("changeRoleFor", { name: staff.fullName || staff.email })}
        className="h-8 text-xs min-w-[130px] bg-surface"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {assignable.map((r) => (
          <SelectItem key={r.id} value={r.id}>
            {locale === "ar" ? r.nameAr : r.nameEn}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
