"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { LuPencil, LuPlus, LuTrash2, LuTriangleAlert } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { useRouter } from "@/shared/i18n/navigation";
import { confirmAction } from "@/shared/lib/confirm";
import { formatNumber } from "@/shared/lib/format";
import { toast } from "@/shared/lib/toast";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardBody } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { deleteTaxRateAction, saveTaxRateAction, type Result } from "./finance-actions";
import type { TaxRateRow } from "@/modules/finance/infrastructure/finance.repository";

function useShow() {
  const t = useTranslations();
  return (result: Result) => {
    if (result.ok) toast.success({ title: t(result.messageKey) });
    else toast.error({ title: t(result.errorKey), description: result.detail });
    return result.ok;
  };
}

/**
 * Tax rate management (CLAUDE.md §13, Phase 5b).
 *
 * The warning at the top is not decoration: the default rate decides what every
 * new booking is charged, while existing bookings keep the rate stored on them.
 * An admin changing this should know which of those two things is happening.
 */
export function TaxManager({ rates, locale }: { rates: TaxRateRow[]; locale: Locale }) {
  const t = useTranslations("tax");
  const tCommon = useTranslations("common");
  const [editing, setEditing] = useState<TaxRateRow | "new" | null>(null);
  const [pending, startTransition] = useTransition();
  const show = useShow();
  const router = useRouter();

  const current = editing === "new" ? null : editing;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-card border border-warning-100 bg-warning-50 px-4 py-3">
        <LuTriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-700" aria-hidden />
        <p className="text-sm text-warning-700">{t("warning")}</p>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setEditing("new")}>
          <LuPlus aria-hidden />
          {t("create")}
        </Button>
      </div>

      {rates.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center text-sm text-ink-muted">{t("empty")}</CardBody>
        </Card>
      ) : (
        <ul className="space-y-2">
          {rates.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3"
            >
              <div className="min-w-0 space-y-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-medium text-ink" dir="ltr">
                    {r.code}
                  </span>
                  <span className="text-sm text-ink-muted">
                    {locale === "ar" ? r.nameAr : r.nameEn}
                  </span>
                  {r.isDefault ? <Badge tone="brand">{t("isDefault")}</Badge> : null}
                  <Badge tone={r.isActive ? "success" : "neutral"}>
                    {r.isActive ? t("isActive") : tCommon("status.suspended")}
                  </Badge>
                </p>
                <p className="text-sm text-ink tabular-nums">
                  {t("percent")}: {formatNumber(r.percent, locale)}%
                </p>
              </div>

              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`${t("title")} — ${r.code}`}
                  onClick={() => setEditing(r)}
                >
                  <LuPencil aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  loading={pending}
                  onClick={async () => {
                    const ok = await confirmAction({
                      title: t("deleteConfirmTitle"),
                      body: t("deleteConfirmBody"),
                      confirmLabel: tCommon("delete"),
                      cancelLabel: tCommon("cancel"),
                      dir: locale === "ar" ? "rtl" : "ltr",
                    });
                    if (!ok) return;
                    startTransition(async () => {
                      if (show(await deleteTaxRateAction(r.id))) router.refresh();
                    });
                  }}
                >
                  <LuTrash2 aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={current ? current.code : t("create")}
        description={t("description")}
        closeLabel={tCommon("cancel")}
        size="md"
      >
        <form
          key={current?.id ?? "new"}
          action={(fd) =>
            startTransition(async () => {
              if (show(await saveTaxRateAction(fd))) {
                setEditing(null);
                router.refresh();
              }
            })
          }
          className="space-y-4"
        >
          <input type="hidden" name="id" value={current?.id ?? ""} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              name="code"
              required
              dir="ltr"
              defaultValue={current?.code ?? ""}
              label={t("code")}
            />
            <Input
              name="percent"
              type="number"
              step="0.001"
              min="0"
              max="100"
              required
              dir="ltr"
              defaultValue={current ? String(current.percent) : ""}
              label={t("percent")}
            />
            <Input
              name="nameAr"
              required
              defaultValue={current?.nameAr ?? ""}
              label={`${t("nameField")} (AR)`}
            />
            <Input
              name="nameEn"
              required
              dir="ltr"
              defaultValue={current?.nameEn ?? ""}
              label={`${t("nameField")} (EN)`}
            />
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                name="isDefault"
                defaultChecked={current?.isDefault ?? false}
                className="size-4 cursor-pointer rounded border-border-strong"
              />
              {t("isDefault")}
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={current?.isActive ?? true}
                className="size-4 cursor-pointer rounded border-border-strong"
              />
              {t("isActive")}
            </label>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(null)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" size="sm" loading={pending}>
              {t("save")}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
