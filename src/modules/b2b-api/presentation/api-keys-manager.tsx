"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  LuKey,
  LuPlus,
  LuCopy,
  LuCheck,
  LuTrash2,
  LuShieldAlert,
  LuActivity,
} from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { toast } from "@/shared/lib/toast";
import { confirmAction } from "@/shared/lib/confirm";
import { formatDate } from "@/shared/lib/format";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Card, CardBody, CardHeader } from "@/shared/ui/card";
import { Modal } from "@/shared/ui/modal";
import { Input } from "@/shared/ui/input";
import { Switch } from "@/shared/ui/switch";
import {
  createAgencyApiKeyAction,
  deleteApiKeyAction,
  toggleApiKeyStatusAction,
  type ApiKeySummary,
} from "./api-key-actions";

export function ApiKeysManager({
  agencyId,
  initialKeys,
  locale,
  canManage = true,
}: {
  agencyId: string;
  initialKeys: ApiKeySummary[];
  locale: Locale;
  canManage?: boolean;
}) {
  const t = useTranslations("b2bApi");
  const tCommon = useTranslations("common");

  const [keys, setKeys] = useState<ApiKeySummary[]>(initialKeys);
  const [isPending, startTransition] = useTransition();

  // Create Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [allowedIps, setAllowedIps] = useState("");

  // Generated Key Reveal Modal state
  const [generatedSecret, setGeneratedSecret] = useState<string | null>(null);
  const [hasCopied, setHasCopied] = useState(false);

  const handleCreateKey = () => {
    if (!keyName.trim()) return;

    startTransition(async () => {
      const res = await createAgencyApiKeyAction(agencyId, keyName, allowedIps);
      if (res.ok) {
        setGeneratedSecret(res.rawKey);
        setIsCreateOpen(false);
        setKeyName("");
        setAllowedIps("");
        setKeys((prev) => [
          {
            id: res.id,
            name: keyName.trim(),
            keyPrefix: res.keyPrefix,
            isActive: true,
            rateLimitPerMinute: 60,
            allowedIps: allowedIps ? allowedIps.split(/[\n,]+/).map((s) => s.trim()) : null,
            createdAt: new Date().toISOString(),
            lastUsedAt: null,
            expiresAt: null,
          },
          ...prev,
        ]);
        toast.success({ title: t("keyCreatedTitle") });
      } else {
        toast.error({ title: tCommon("errors.unexpected"), description: res.error });
      }
    });
  };

  const handleCopySecret = () => {
    if (!generatedSecret) return;
    navigator.clipboard.writeText(generatedSecret);
    setHasCopied(true);
    toast.success({ title: t("copiedToClipboard") });
    setTimeout(() => setHasCopied(false), 2500);
  };

  const handleToggle = (keyId: string, current: boolean) => {
    const next = !current;
    setKeys((prev) => prev.map((k) => (k.id === keyId ? { ...k, isActive: next } : k)));

    startTransition(async () => {
      const res = await toggleApiKeyStatusAction(keyId, agencyId, next);
      if (res.ok) {
        toast.success({ title: t("statusUpdated") });
      } else {
        // Revert
        setKeys((prev) => prev.map((k) => (k.id === keyId ? { ...k, isActive: current } : k)));
        toast.error({ title: tCommon("errors.unexpected") });
      }
    });
  };

  const handleDelete = async (keyId: string, name: string) => {
    const confirmed = await confirmAction({
      title: t("confirmDeleteTitle"),
      body: t("confirmDeleteBody", { name }),
      confirmLabel: tCommon("delete"),
      cancelLabel: tCommon("cancel"),
      destructive: true,
      dir: locale === "ar" ? "rtl" : "ltr",
    });

    if (!confirmed) return;

    startTransition(async () => {
      const res = await deleteApiKeyAction(keyId, agencyId);
      if (res.ok) {
        setKeys((prev) => prev.filter((k) => k.id !== keyId));
        toast.success({ title: t("keyDeleted") });
      } else {
        toast.error({ title: tCommon("errors.unexpected") });
      }
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={t("keysCardTitle")}
          description={t("keysCardDescription")}
          actions={
            canManage ? (
              <Button variant="primary" size="sm" onClick={() => setIsCreateOpen(true)}>
                <LuPlus aria-hidden />
                {t("generateKeyButton")}
              </Button>
            ) : undefined
          }
        />
        <CardBody className="p-0">
          {keys.length === 0 ? (
            <div className="p-8 text-center">
              <LuKey className="mx-auto size-10 text-ink-subtle" aria-hidden />
              <p className="mt-3 text-sm font-medium text-ink">{t("noKeysTitle")}</p>
              <p className="mt-1 text-xs text-ink-muted">{t("noKeysDescription")}</p>
              {canManage ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-4"
                  onClick={() => setIsCreateOpen(true)}
                >
                  <LuPlus aria-hidden />
                  {t("generateKeyButton")}
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {keys.map((k) => (
                <div
                  key={k.id}
                  className="flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink">{k.name}</span>
                      <Badge tone={k.isActive ? "success" : "neutral"}>
                        {k.isActive ? tCommon("status.active") : t("status.inactive")}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-ink-muted">
                      <span className="font-mono rounded bg-surface-raised px-1.5 py-0.5 text-2xs text-ink">
                        {k.keyPrefix}
                      </span>
                      <span className="flex items-center gap-1">
                        <LuActivity className="size-3 text-brand-600" aria-hidden />
                        {t("rateLimitLabel", { limit: k.rateLimitPerMinute })}
                      </span>
                      <span>
                        {t("createdAtLabel", { date: formatDate(k.createdAt, locale) })}
                      </span>
                      {k.lastUsedAt ? (
                        <span className="text-success-700 dark:text-success-400">
                          {t("lastUsedLabel", { date: formatDate(k.lastUsedAt, locale) })}
                        </span>
                      ) : (
                        <span>{t("neverUsed")}</span>
                      )}
                    </div>
                    {k.allowedIps && k.allowedIps.length > 0 ? (
                      <p className="text-2xs text-ink-muted">
                        {t("ipWhitelistLabel")}: {k.allowedIps.join(", ")}
                      </p>
                    ) : null}
                  </div>

                  {canManage ? (
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={k.isActive}
                        disabled={isPending}
                        onCheckedChange={() => handleToggle(k.id, k.isActive)}
                        aria-label={t("toggleStatus")}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isPending}
                        onClick={() => handleDelete(k.id, k.name)}
                        className="text-danger-600 hover:bg-danger-50 hover:text-danger-700 dark:hover:bg-danger-950/30"
                      >
                        <LuTrash2 aria-hidden />
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Create Key Modal */}
      <Modal
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        title={t("modalCreateTitle")}
        description={t("modalCreateDesc")}
        closeLabel={tCommon("cancel")}
      >
        <div className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-medium text-ink mb-1">
              {t("fields.keyName")}
            </label>
            <Input
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder={t("fields.keyNamePlaceholder")}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink mb-1">
              {t("fields.allowedIps")}
            </label>
            <Input
              value={allowedIps}
              onChange={(e) => setAllowedIps(e.target.value)}
              placeholder={t("fields.allowedIpsPlaceholder")}
            />
            <p className="mt-1 text-2xs text-ink-muted">{t("fields.allowedIpsHint")}</p>
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="secondary" onClick={() => setIsCreateOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button
              variant="primary"
              disabled={!keyName.trim() || isPending}
              loading={isPending}
              onClick={handleCreateKey}
            >
              {t("createKeySubmit")}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Secret Key Generated Reveal Modal */}
      <Modal
        open={Boolean(generatedSecret)}
        onOpenChange={(open) => {
          if (!open) setGeneratedSecret(null);
        }}
        title={t("modalRevealTitle")}
        description={t("modalRevealDesc")}
        closeLabel={tCommon("confirm")}
      >
        <div className="space-y-4 pt-2">
          <div className="flex items-start gap-2.5 rounded-control border border-warning-200 bg-warning-50 p-3 text-xs text-warning-900 dark:border-warning-900 dark:bg-warning-950/40 dark:text-warning-200">
            <LuShieldAlert className="size-5 shrink-0 text-warning-600" aria-hidden />
            <div>
              <p className="font-semibold">{t("secretWarningTitle")}</p>
              <p className="mt-0.5">{t("secretWarningBody")}</p>
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-ink">
              {t("yourApiKeyLabel")}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={generatedSecret ?? ""}
                className="w-full rounded-control border border-border bg-surface-raised px-3 py-2 font-mono text-xs font-semibold text-ink select-all focus:outline-hidden"
              />
              <Button
                variant={hasCopied ? "secondary" : "primary"}
                onClick={handleCopySecret}
                className="shrink-0"
              >
                {hasCopied ? <LuCheck aria-hidden /> : <LuCopy aria-hidden />}
                <span>{hasCopied ? t("copied") : t("copy")}</span>
              </Button>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="secondary" onClick={() => setGeneratedSecret(null)}>
              {t("closeModalDone")}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
