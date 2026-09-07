"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { LuCircleCheck, LuCircleX, LuKeyRound, LuPlugZap } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { confirmAction } from "@/shared/lib/confirm";
import { toast } from "@/shared/lib/toast";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import {
  clearCredentialAction,
  setCredentialAction,
  setSupplierEnabledAction,
  setSupplierEnvironmentAction,
  testSupplierAction,
  type Result,
} from "./supplier-actions";

function useResultToast() {
  const t = useTranslations();
  return (result: Result) => {
    if (result.ok) toast.success({ title: t(result.messageKey), description: result.detail });
    else toast.error({ title: t(result.errorKey), description: result.detail });
    return result.ok;
  };
}

export type SupplierRow = {
  providerKey: string;
  displayNameAr: string;
  displayNameEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  isEnabled: boolean;
  environment: string;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
  hasAdapter: boolean;
  /** Which credentials are stored and when — never the values (§9). */
  credentials: { credentialKey: string; updatedAt: string }[];
  /** Credential fields this provider expects. */
  requiredKeys: string[];
};

/**
 * Supplier credential management (CLAUDE.md §9).
 *
 * The screen shows only *whether* each credential is set and when it changed.
 * There is no reveal control and no masked value, because the plaintext is not
 * readable through any client-reachable path — rotating means entering a new
 * value, not reading the old one.
 */
export function SupplierCard({ supplier, locale }: { supplier: SupplierRow; locale: Locale }) {
  const t = useTranslations("suppliers");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const show = useResultToast();

  const stored = new Map(supplier.credentials.map((c) => [c.credentialKey, c.updatedAt]));
  const name = locale === "ar" ? supplier.displayNameAr : supplier.displayNameEn;
  const description = locale === "ar" ? supplier.descriptionAr : supplier.descriptionEn;

  const missing = supplier.requiredKeys.filter((k) => !stored.has(k));
  const canEnable = supplier.hasAdapter && missing.length === 0;

  return (
    <div className="rounded-card border border-border bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
            {name}
            <Badge tone={supplier.isEnabled ? "success" : "neutral"}>
              {t(supplier.isEnabled ? "enabled" : "disabled")}
            </Badge>
            <Badge tone={supplier.environment === "production" ? "danger" : "neutral"}>
              {t(`environment.${supplier.environment}`)}
            </Badge>
            {!supplier.hasAdapter ? <Badge tone="warning">{t("noAdapter")}</Badge> : null}
          </p>
          {description ? <p className="max-w-prose text-sm text-ink-muted">{description}</p> : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            loading={pending}
            disabled={!supplier.hasAdapter}
            onClick={() =>
              startTransition(async () => void show(await testSupplierAction(supplier.providerKey)))
            }
          >
            <LuPlugZap aria-hidden />
            {t("test")}
          </Button>

          <Button
            size="sm"
            variant={supplier.isEnabled ? "ghost" : "primary"}
            loading={pending}
            // Enabling a supplier with missing credentials would put it into
            // search where it can only return nothing.
            disabled={!supplier.isEnabled && !canEnable}
            title={!supplier.isEnabled && !canEnable ? t("cannotEnable") : undefined}
            onClick={async () => {
              if (supplier.isEnabled) {
                const confirmed = await confirmAction({
                  title: t("disableConfirmTitle"),
                  body: t("disableConfirmBody"),
                  confirmLabel: t("disable"),
                  cancelLabel: tCommon("cancel"),
                  dir: locale === "ar" ? "rtl" : "ltr",
                });
                if (!confirmed) return;
              }
              startTransition(async () => {
                void show(
                  await setSupplierEnabledAction(supplier.providerKey, !supplier.isEnabled),
                );
              });
            }}
          >
            {t(supplier.isEnabled ? "disable" : "enable")}
          </Button>
        </div>
      </div>

      {supplier.lastTestedAt ? (
        <div
          className={
            "flex items-start gap-2 px-5 py-2.5 text-xs " +
            (supplier.lastTestOk ? "text-success-700" : "text-danger-700")
          }
        >
          {supplier.lastTestOk ? (
            <LuCircleCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          ) : (
            <LuCircleX className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          )}
          <span className="min-w-0">{supplier.lastTestMessage}</span>
        </div>
      ) : null}

      <div className="space-y-3 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <LuKeyRound className="size-3.5" aria-hidden />
            {t("credentials")}
          </h3>
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            {t("environmentLabel")}
            <select
              value={supplier.environment}
              disabled={pending}
              onChange={(e) =>
                startTransition(async () => {
                  void show(
                    await setSupplierEnvironmentAction(
                      supplier.providerKey,
                      e.target.value as "sandbox" | "production",
                    ),
                  );
                })
              }
              className="h-7 cursor-pointer rounded-control border border-border bg-surface px-2 text-xs text-ink focus-visible:outline-2 focus-visible:outline-focus"
            >
              <option value="sandbox">{t("environment.sandbox")}</option>
              <option value="production">{t("environment.production")}</option>
            </select>
          </label>
        </div>

        <ul className="divide-y divide-border rounded-control border border-border">
          {supplier.requiredKeys.map((key) => {
            const updatedAt = stored.get(key);
            return (
              <li
                key={key}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
              >
                <span className="min-w-0">
                  <span className="block font-mono text-xs text-ink" dir="ltr">
                    {key}
                  </span>
                  <span className="block text-2xs text-ink-subtle">
                    {updatedAt ? t("storedOn", { date: updatedAt.slice(0, 10) }) : t("notSet")}
                  </span>
                </span>

                <span className="flex shrink-0 items-center gap-1">
                  <Badge tone={updatedAt ? "success" : "neutral"}>
                    {t(updatedAt ? "set" : "missing")}
                  </Badge>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(key)}>
                    {updatedAt ? t("rotate") : t("setValue")}
                  </Button>
                  {updatedAt ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={pending}
                      onClick={async () => {
                        const confirmed = await confirmAction({
                          title: t("clearConfirmTitle"),
                          body: t("clearConfirmBody"),
                          confirmLabel: tCommon("delete"),
                          cancelLabel: tCommon("cancel"),
                          dir: locale === "ar" ? "rtl" : "ltr",
                        });
                        if (confirmed) {
                          startTransition(async () => {
                            void show(await clearCredentialAction(supplier.providerKey, key));
                          });
                        }
                      }}
                    >
                      {tCommon("delete")}
                    </Button>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>

        <p className="text-2xs text-ink-subtle">{t("vaultNote")}</p>
      </div>

      <CredentialModal
        providerKey={supplier.providerKey}
        credentialKey={editing}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

function CredentialModal({
  providerKey,
  credentialKey,
  onClose,
}: {
  providerKey: string;
  credentialKey: string | null;
  onClose: () => void;
}) {
  const t = useTranslations("suppliers");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const show = useResultToast();

  return (
    <Modal
      open={credentialKey !== null}
      onOpenChange={(open) => !open && onClose()}
      title={t("setCredentialTitle", { key: credentialKey ?? "" })}
      description={t("setCredentialDescription")}
      closeLabel={tCommon("cancel")}
      size="md"
    >
      <form
        action={(fd) =>
          startTransition(async () => {
            if (show(await setCredentialAction(fd))) onClose();
          })
        }
        className="space-y-4"
      >
        <input type="hidden" name="providerKey" value={providerKey} />
        <input type="hidden" name="credentialKey" value={credentialKey ?? ""} />
        <Input
          name="value"
          type="password"
          required
          dir="ltr"
          autoComplete="off"
          label={t("valueLabel")}
          hint={t("valueHint")}
        />
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            {tCommon("cancel")}
          </Button>
          <Button type="submit" size="sm" loading={pending}>
            {tCommon("save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
