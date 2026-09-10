"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { LuPencil, LuPlus, LuTrash2 } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { useRouter } from "@/shared/i18n/navigation";
import { confirmAction } from "@/shared/lib/confirm";
import { formatDate, formatNumber } from "@/shared/lib/format";
import { toast } from "@/shared/lib/toast";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardBody } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import {
  deletePromoCodeAction,
  savePromoCodeAction,
  type Result,
} from "./finance-actions";
import type { PromoCodeRow } from "@/modules/finance/infrastructure/finance.repository";

function useShow() {
  const t = useTranslations();
  return (result: Result) => {
    if (result.ok) toast.success({ title: t(result.messageKey) });
    else toast.error({ title: t(result.errorKey), description: result.detail });
    return result.ok;
  };
}

/**
 * Promo code management (CLAUDE.md §13, Phase 5b).
 *
 * `timesUsed` is shown but never editable — it is maintained by the redemption
 * trigger, and a form that let an admin reset it would let a single-use code
 * be used twice.
 */
export function PromoManager({
  promos,
  agencies,
  locale,
}: {
  promos: PromoCodeRow[];
  agencies: { id: string; name: string }[];
  locale: Locale;
}) {
  const t = useTranslations("promos");
  const tCommon = useTranslations("common");
  const [editing, setEditing] = useState<PromoCodeRow | "new" | null>(null);
  const [pending, startTransition] = useTransition();
  const show = useShow();
  const router = useRouter();

  const current = editing === "new" ? null : editing;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setEditing("new")}>
          <LuPlus aria-hidden />
          {t("create")}
        </Button>
      </div>

      {promos.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center text-sm text-ink-muted">{t("empty")}</CardBody>
        </Card>
      ) : (
        <ul className="space-y-2">
          {promos.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3"
            >
              <div className="min-w-0 space-y-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-medium text-ink" dir="ltr">
                    {p.code}
                  </span>
                  <Badge tone={p.isActive ? "success" : "neutral"}>
                    {p.isActive ? t("isActive") : tCommon("status.suspended")}
                  </Badge>
                  <span className="text-sm text-ink-muted">
                    {locale === "ar" ? p.nameAr : p.nameEn}
                  </span>
                </p>
                <p className="flex flex-wrap items-center gap-3 text-xs text-ink-muted">
                  <span>
                    {t("discount")}:{" "}
                    {p.discountType === "percentage"
                      ? `${formatNumber(p.discountValue, locale)}%`
                      : formatNumber(p.discountValue, locale)}
                  </span>
                  <span dir="ltr">
                    {formatDate(p.validFrom, locale)} → {formatDate(p.validTo, locale)}
                  </span>
                  <span>
                    {t("usage")}: {formatNumber(p.timesUsed, locale)}
                    {p.maxRedemptions ? ` / ${formatNumber(p.maxRedemptions, locale)}` : ""}
                  </span>
                  <span>
                    {t("scope")}:{" "}
                    {p.agencyId
                      ? (agencies.find((a) => a.id === p.agencyId)?.name ?? t("unknownAgency"))
                      : t("allAgencies")}
                  </span>
                </p>
              </div>

              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="sm" onClick={() => setEditing(p)}>
                  <LuPencil aria-hidden />
                  {t("edit")}
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
                      if (show(await deletePromoCodeAction(p.id))) router.refresh();
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
        title={current ? t("edit") : t("create")}
        description={t("description")}
        closeLabel={tCommon("cancel")}
        size="lg"
      >
        <form
          key={current?.id ?? "new"}
          action={(fd) =>
            startTransition(async () => {
              if (show(await savePromoCodeAction(fd))) {
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
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-ink">{t("agencyScope")}</span>
              <select
                name="agencyId"
                defaultValue={current?.agencyId ?? ""}
                className="h-9 w-full cursor-pointer rounded-control border border-border bg-surface px-2.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
              >
                <option value="">{t("allAgencies")}</option>
                {agencies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>

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

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-ink">{t("discountType")}</span>
              <select
                name="discountType"
                defaultValue={current?.discountType ?? "percentage"}
                className="h-9 w-full cursor-pointer rounded-control border border-border bg-surface px-2.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
              >
                <option value="percentage">{t("percentage")}</option>
                <option value="fixed">{t("fixed")}</option>
              </select>
            </label>
            <Input
              name="discountValue"
              type="number"
              step="0.01"
              min="0"
              required
              dir="ltr"
              defaultValue={current ? String(current.discountValue) : ""}
              label={t("discountValue")}
            />

            <Input
              name="validFrom"
              type="date"
              required
              dir="ltr"
              defaultValue={current?.validFrom ?? ""}
              label={t("validFrom")}
            />
            <Input
              name="validTo"
              type="date"
              required
              dir="ltr"
              defaultValue={current?.validTo ?? ""}
              label={t("validTo")}
            />

            <Input
              name="minBookingTotal"
              type="number"
              step="0.01"
              min="0"
              dir="ltr"
              defaultValue={current?.minBookingTotal != null ? String(current.minBookingTotal) : ""}
              label={t("minBookingTotal")}
            />
            <Input
              name="maxDiscount"
              type="number"
              step="0.01"
              min="0"
              dir="ltr"
              defaultValue={current?.maxDiscount != null ? String(current.maxDiscount) : ""}
              label={t("maxDiscount")}
              hint={t("unlimited")}
            />

            <Input
              name="maxRedemptions"
              type="number"
              min="1"
              dir="ltr"
              defaultValue={current?.maxRedemptions != null ? String(current.maxRedemptions) : ""}
              label={t("maxRedemptions")}
              hint={t("unlimited")}
            />
            <Input
              name="maxPerAgency"
              type="number"
              min="1"
              dir="ltr"
              defaultValue={current?.maxPerAgency != null ? String(current.maxPerAgency) : ""}
              label={t("maxPerAgency")}
              hint={t("unlimited")}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={current?.isActive ?? true}
              className="size-4 cursor-pointer rounded border-border-strong"
            />
            {t("isActive")}
          </label>

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
