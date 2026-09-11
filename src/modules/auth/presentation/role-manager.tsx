"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { LuPlus, LuTrash2 } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { confirmAction } from "@/shared/lib/confirm";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { NativeSelect } from "@/shared/ui/select";
import type { PermissionRow, RoleSummary } from "@/modules/auth/infrastructure/access.repository";
import {
  createRoleAction,
  deleteRoleAction,
  setRolePermissionsAction,
  updateRoleAction,
  type Result,
} from "./access-actions";

/**
 * Role builder (CLAUDE.md §7).
 *
 * The permission matrix is a plain form of checkboxes named `permissions`, so
 * the whole set posts in one submit and the action can diff it. That also means
 * it degrades to a working form without JavaScript.
 */

function useResultToast() {
  const t = useTranslations();
  return (result: Result) => {
    if (result.ok) {
      toast.success({ title: t(result.messageKey) });
    } else {
      toast.error({
        title: t(result.errorKey),
        // `detail` carries the database's own refusal message, which is written
        // for humans (e.g. "Only a super admin can grant the super admin role").
        description: result.detail,
      });
    }
    return result.ok;
  };
}

export function CreateRoleButton() {
  const t = useTranslations("access.roles");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const show = useResultToast();

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <LuPlus aria-hidden />
        {t("create")}
      </Button>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={t("createTitle")}
        description={t("createDescription")}
        closeLabel={tCommon("cancel")}
      >
        <form
          id="create-role"
          action={(fd) =>
            startTransition(async () => {
              if (show(await createRoleAction(fd))) setOpen(false);
            })
          }
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              name="key"
              required
              dir="ltr"
              label={t("fields.key")}
              hint={t("fields.keyHint")}
              placeholder="reservations_officer"
            />
            <NativeSelect
              id="role-scope"
              name="scope"
              required
              defaultValue="admin"
              label={t("fields.scope")}
            >
              <option value="admin">{t("scope.admin")}</option>
              <option value="agent">{t("scope.agent")}</option>
            </NativeSelect>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input name="nameAr" required label={t("fields.nameAr")} />
            <Input name="nameEn" required dir="ltr" label={t("fields.nameEn")} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input name="descriptionAr" label={t("fields.descriptionAr")} />
            <Input name="descriptionEn" dir="ltr" label={t("fields.descriptionEn")} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" size="sm" loading={pending}>
              {tCommon("save")}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function DeleteRoleButton({ role, locale }: { role: RoleSummary; locale: Locale }) {
  const t = useTranslations("access.roles");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const show = useResultToast();

  // System roles are protected in the database; not rendering the control keeps
  // the UI honest rather than offering a button that always fails.
  if (role.isSystem) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      loading={pending}
      aria-label={t("deleteLabel", { name: locale === "ar" ? role.nameAr : role.nameEn })}
      onClick={async () => {
        const confirmed = await confirmAction({
          title: t("deleteConfirmTitle"),
          body: t("deleteConfirmBody"),
          confirmLabel: tCommon("delete"),
          cancelLabel: tCommon("cancel"),
          dir: locale === "ar" ? "rtl" : "ltr",
        });
        if (confirmed) startTransition(async () => void show(await deleteRoleAction(role.id)));
      }}
    >
      <LuTrash2 aria-hidden />
    </Button>
  );
}

export function RoleDetailsForm({
  role,
}: {
  role: {
    id: string;
    nameAr: string;
    nameEn: string;
    descriptionAr: string | null;
    descriptionEn: string | null;
  };
}) {
  const t = useTranslations("access.roles");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const show = useResultToast();

  return (
    <form
      action={(fd) => startTransition(async () => void show(await updateRoleAction(fd)))}
      className="space-y-4"
    >
      <input type="hidden" name="id" value={role.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input name="nameAr" required defaultValue={role.nameAr} label={t("fields.nameAr")} />
        <Input
          name="nameEn"
          required
          dir="ltr"
          defaultValue={role.nameEn}
          label={t("fields.nameEn")}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          name="descriptionAr"
          defaultValue={role.descriptionAr ?? ""}
          label={t("fields.descriptionAr")}
        />
        <Input
          name="descriptionEn"
          dir="ltr"
          defaultValue={role.descriptionEn ?? ""}
          label={t("fields.descriptionEn")}
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={pending}>
          {tCommon("save")}
        </Button>
      </div>
    </form>
  );
}

/**
 * The permission matrix.
 *
 * `grantable` is the set the *acting* user holds. Anything outside it renders
 * disabled with an explanation, because §7 rule 5 forbids granting a permission
 * you do not hold — showing it as a normal checkbox that then fails server-side
 * would be a worse experience than showing why it is unavailable.
 */
export function PermissionMatrix({
  roleId,
  modules,
  granted,
  grantable,
  locale,
  readOnly = false,
}: {
  roleId: string;
  modules: [string, PermissionRow[]][];
  granted: string[];
  grantable: string[] | "all";
  locale: Locale;
  readOnly?: boolean;
}) {
  const t = useTranslations("access.permissions");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const show = useResultToast();

  const grantedSet = new Set(granted);
  const canGrant = (key: string) => grantable === "all" || grantable.includes(key);

  return (
    <form
      action={(fd) => startTransition(async () => void show(await setRolePermissionsAction(fd)))}
      className="space-y-5"
    >
      <input type="hidden" name="roleId" value={roleId} />

      {modules.map(([moduleName, rows]) => (
        <fieldset key={moduleName} className="rounded-control border border-border p-4">
          <legend className="px-1.5 text-xs font-semibold tracking-wide text-ink-muted uppercase">
            {t(`modules.${moduleName}`)}
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {rows.map((p) => {
              const allowed = canGrant(p.key);
              return (
                <label
                  key={p.key}
                  className={
                    "flex items-start gap-2.5 rounded-control p-2 text-sm " +
                    (readOnly || !allowed
                      ? "cursor-not-allowed opacity-60"
                      : "cursor-pointer hover:bg-surface-hover")
                  }
                  title={!allowed ? t("cannotGrant") : undefined}
                >
                  <input
                    type="checkbox"
                    name="permissions"
                    value={p.key}
                    defaultChecked={grantedSet.has(p.key)}
                    disabled={readOnly || !allowed}
                    className="mt-0.5 size-4 shrink-0 rounded-[4px] border-border-strong accent-brand-600"
                  />
                  <span className="min-w-0">
                    <span className="block text-ink">{locale === "ar" ? p.nameAr : p.nameEn}</span>
                    <span className="block font-mono text-2xs text-ink-subtle" dir="ltr">
                      {p.key}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      {!readOnly ? (
        <div className="flex justify-end">
          <Button type="submit" loading={pending}>
            {tCommon("save")}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
