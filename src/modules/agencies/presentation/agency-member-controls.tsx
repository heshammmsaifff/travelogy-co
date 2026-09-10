"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { LuCopy, LuPlus, LuTriangleAlert } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { confirmAction } from "@/shared/lib/confirm";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { NativeSelect } from "@/shared/ui/select";
import type { AgentRoleOption } from "@/modules/auth/infrastructure/access.repository";
import {
  createAgencyUserAction,
  setAgencyUserStatusAction,
  type Result,
} from "./agency-user-actions";

function useResultToast() {
  const t = useTranslations();
  return (result: Result) => {
    if (result.ok) {
      toast.success({ title: t(result.messageKey) });
    } else {
      toast.error({
        title: t(result.errorKey),
        description: result.detail,
      });
    }
    return result.ok;
  };
}

export function CreateAgencyMemberButton({
  agencyId,
  roles,
  locale,
  namespace = "agencies.members",
}: {
  agencyId: string;
  roles: AgentRoleOption[];
  locale: Locale;
  namespace?: "agencies.members" | "agent.team";
}) {
  const t = useTranslations(namespace);
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const show = useResultToast();

  const defaultRole = roles.find((r) => r.key === "agent_user") ?? roles[0];

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
                const result = await createAgencyUserAction(fd);
                if (show(result) && result.ok && result.secret) {
                  setSecret({ email: String(fd.get("email")), password: result.secret });
                }
              })
            }
            className="space-y-4"
          >
            <input type="hidden" name="agencyId" value={agencyId} />

            <Input name="fullName" required label={t("fields.fullName")} />
            <Input name="email" type="email" required dir="ltr" label={t("fields.email")} />

            <NativeSelect
              id="agency-member-role"
              name="roleId"
              required
              defaultValue={defaultRole?.id ?? ""}
              label={t("fields.role")}
            >
              <option value="" disabled>
                {t("selectRole")}
              </option>
              {roles.map((r) => (
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

export function AgencyUserStatusButton({
  agencyId,
  member,
  currentUserId,
  locale,
  namespace = "agencies.members",
}: {
  agencyId: string;
  member: { id: string; fullName: string | null; email: string; status: string };
  currentUserId?: string;
  locale: Locale;
  namespace?: "agencies.members" | "agent.team";
}) {
  const t = useTranslations(namespace);
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const show = useResultToast();

  if (currentUserId && currentUserId === member.id) {
    return null;
  }

  const suspending = member.status === "active";

  return (
    <Button
      size="sm"
      variant={suspending ? "ghost" : "secondary"}
      loading={pending}
      onClick={async () => {
        if (suspending) {
          const confirmed = await confirmAction({
            title: t("suspendConfirmTitle"),
            body: t("suspendConfirmBody", { name: member.fullName || member.email }),
            confirmLabel: t("suspend"),
            cancelLabel: tCommon("cancel"),
            dir: locale === "ar" ? "rtl" : "ltr",
          });
          if (!confirmed) return;
        }
        startTransition(async () => {
          void show(
            await setAgencyUserStatusAction(
              agencyId,
              member.id,
              suspending ? "suspended" : "active",
            ),
          );
        });
      }}
    >
      {suspending ? t("suspend") : t("reactivate")}
    </Button>
  );
}
