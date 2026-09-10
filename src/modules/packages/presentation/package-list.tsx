"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { LuPlus, LuTrash2 } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { Link, useRouter } from "@/shared/i18n/navigation";
import { confirmAction } from "@/shared/lib/confirm";
import { formatNumber } from "@/shared/lib/format";
import { toast } from "@/shared/lib/toast";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardBody } from "@/shared/ui/card";
import { CountrySelect } from "@/shared/ui/country-select";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import type { PackageSummary } from "@/modules/packages/infrastructure/packages.repository";
import { deletePackageAction, savePackageAction, type Result } from "./package-actions";

const STATUS_TONE = { draft: "warning", active: "success", archived: "neutral" } as const;

function useShow() {
  const t = useTranslations();
  return (result: Result) => {
    if (result.ok) toast.success({ title: t(result.messageKey) });
    else toast.error({ title: t(result.errorKey), description: result.detail });
    return result.ok;
  };
}

/**
 * The package catalogue (CLAUDE.md §13, Phase 8c).
 *
 * Creating one asks only for what a tour cannot exist without — a name, a
 * place and a length. The itinerary, the rates and the departures are the
 * editor's job, because none of them can be filled in before the tour exists.
 */
export function PackageList({
  packages,
  locale,
}: {
  packages: PackageSummary[];
  locale: Locale;
}) {
  const t = useTranslations("packages");
  const tCommon = useTranslations("common");
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();
  const show = useShow();
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <LuPlus aria-hidden />
          {t("create")}
        </Button>
      </div>

      {packages.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center text-sm text-ink-muted">{t("empty")}</CardBody>
        </Card>
      ) : (
        <ul className="space-y-2">
          {packages.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3"
            >
              <div className="min-w-0 space-y-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-ink-subtle" dir="ltr">
                    {p.code}
                  </span>
                  <Link
                    href={`/admin/packages/${p.id}`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {locale === "ar" ? p.nameAr : p.nameEn}
                  </Link>
                  <Badge tone={STATUS_TONE[p.status]}>{t(`status.${p.status}`)}</Badge>
                </p>
                <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
                  <span>
                    {locale === "ar" ? p.cityAr : p.cityEn} · {p.countryCode}
                  </span>
                  <span>{t("nights", { count: formatNumber(p.durationNights, locale) })}</span>
                </p>
              </div>

              <div className="flex shrink-0 gap-1">
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
                      if (show(await deletePackageAction(p.id))) router.refresh();
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
        open={creating}
        onOpenChange={setCreating}
        title={t("create")}
        closeLabel={tCommon("cancel")}
        size="lg"
      >
        <form
          action={(fd) =>
            startTransition(async () => {
              const result = await savePackageAction(fd);
              if (show(result)) {
                setCreating(false);
                // Straight into the editor: a tour with no itinerary, no rates
                // and no departures cannot be sold, so the list is not where
                // this ends.
                if (result.ok && result.packageId) {
                  router.push(`/admin/packages/${result.packageId}`);
                } else {
                  router.refresh();
                }
              }
            })
          }
          className="space-y-4"
        >
          <input type="hidden" name="id" value="" />
          <input type="hidden" name="status" value="draft" />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input name="code" required dir="ltr" label={t("fields.code")} />
            <Input
              name="durationNights"
              type="number"
              min={1}
              max={60}
              required
              dir="ltr"
              defaultValue="3"
              label={t("fields.durationNights")}
            />
            <Input name="nameAr" required label={t("fields.nameAr")} />
            <Input name="nameEn" required dir="ltr" label={t("fields.nameEn")} />
            <Input name="cityAr" required label={`${t("fields.city")} (AR)`} />
            <Input name="cityEn" required dir="ltr" label={`${t("fields.city")} (EN)`} />
            <CountrySelect
              name="countryCode"
              required
              defaultValue="EG"
              label={t("fields.country")}
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="secondary" size="sm" onClick={() => setCreating(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" size="sm" loading={pending}>
              {tCommon("save")}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
