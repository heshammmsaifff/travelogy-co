"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { LuPlus } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { Link, useRouter } from "@/shared/i18n/navigation";
import { formatNumber } from "@/shared/lib/format";
import { toast } from "@/shared/lib/toast";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardBody } from "@/shared/ui/card";
import { CountrySelect } from "@/shared/ui/country-select";
import { Input } from "@/shared/ui/input";
import { PhoneInput } from "@/shared/ui/phone-input";
import { Modal } from "@/shared/ui/modal";
import { LEAD_SOURCES, LEAD_STAGES, type LeadStage } from "@/modules/crm/domain/crm";
import type { Lead } from "@/modules/crm/infrastructure/crm.repository";
import { saveLeadAction, type Result } from "./crm-actions";

const SELECT_CLASS =
  "h-9 w-full cursor-pointer rounded-control border border-border bg-surface px-2.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus";

const STAGE_TONE: Record<LeadStage, "neutral" | "brand" | "warning" | "success" | "danger"> = {
  new: "neutral",
  contacted: "brand",
  qualified: "brand",
  proposal: "warning",
  won: "success",
  lost: "danger",
};

function useShow() {
  const t = useTranslations();
  return (result: Result) => {
    if (result.ok) toast.success({ title: t(result.messageKey) });
    else toast.error({ title: t(result.errorKey), description: result.detail });
    return result.ok;
  };
}

/**
 * The pipeline (CLAUDE.md §13, Phase 8d).
 *
 * A column per stage, because the question a sales lead asks first is "what is
 * stuck where" and a flat table cannot answer it at a glance. The counts come
 * from `crm_pipeline_summary()` rather than from `leads.length`, so a column
 * heading cannot disagree with the board underneath it when the list is capped.
 *
 * `won` is not offered when creating a lead: winning one links it to a
 * registered agency, which is `convert_lead`'s job on the detail screen. A
 * dropdown that set it here would put a stage on a lead with no agency behind
 * it, and the database refuses that anyway.
 */
export function LeadBoard({
  leads,
  counts,
  owners,
  locale,
}: {
  leads: Lead[];
  counts: Record<LeadStage, number>;
  owners: { id: string; name: string }[];
  locale: Locale;
}) {
  const t = useTranslations("crm");
  const tCommon = useTranslations("common");
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();
  const show = useShow();
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {t("leadCount", {
            count: formatNumber(
              LEAD_STAGES.reduce((sum, s) => sum + counts[s], 0),
              locale,
            ),
          })}
        </p>
        <Button size="sm" onClick={() => setCreating(true)}>
          <LuPlus aria-hidden />
          {t("create")}
        </Button>
      </div>

      {/* Scrolls horizontally rather than wrapping: six columns on a laptop is
          a board, six wrapped rows is a list nobody reads. */}
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-3">
          {LEAD_STAGES.map((stage) => {
            const inStage = leads.filter((l) => l.stage === stage);
            return (
              <section key={stage} className="w-64 shrink-0 space-y-2">
                <header className="flex items-center justify-between gap-2 rounded-control bg-surface-sunken px-3 py-2">
                  <span className="text-sm font-medium text-ink">{t(`stage.${stage}`)}</span>
                  <Badge tone={STAGE_TONE[stage]}>{formatNumber(counts[stage], locale)}</Badge>
                </header>

                {inStage.length === 0 ? (
                  <p className="rounded-card border border-dashed border-border px-3 py-6 text-center text-xs text-ink-subtle">
                    {t("emptyStage")}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {inStage.map((lead) => (
                      <li key={lead.id}>
                        <Link
                          href={`/admin/crm/${lead.id}`}
                          className="block space-y-1 rounded-card border border-border bg-surface px-3 py-2.5 transition-colors hover:border-border-strong"
                        >
                          <p className="text-sm font-medium text-ink">{lead.companyName}</p>
                          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-ink-muted">
                            <span className="font-mono" dir="ltr">
                              {lead.reference}
                            </span>
                            {lead.contactName ? <span>{lead.contactName}</span> : null}
                          </p>
                          <p className="flex flex-wrap items-center gap-x-2 text-2xs text-ink-subtle">
                            <span>{t(`source.${lead.source}`)}</span>
                            <span>{lead.ownerName ?? t("fields.unassigned")}</span>
                          </p>
                          {lead.stage === "won" && lead.wonAgencyCode ? (
                            <p className="text-2xs text-success-700">
                              {t("wonAs", { agency: lead.wonAgencyCode })}
                            </p>
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </div>

      <p className="rounded-control bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
        {t("internalOnly")}
      </p>

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
              const result = await saveLeadAction(fd);
              if (show(result)) {
                setCreating(false);
                if (result.ok && result.leadId) router.push(`/admin/crm/${result.leadId}`);
                else router.refresh();
              }
            })
          }
          className="space-y-4"
        >
          <input type="hidden" name="id" value="" />
          <input type="hidden" name="stage" value="new" />

          <Input name="companyName" required label={t("fields.companyName")} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input name="contactName" label={t("fields.contactName")} />
            <Input name="email" type="email" dir="ltr" label={t("fields.email")} />
            <PhoneInput name="phone" label={t("fields.phone")} />
            <Input name="city" label={t("fields.city")} />
            <CountrySelect name="countryCode" label={t("fields.country")} />

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-ink">{t("fields.sourceLabel")}</span>
              <select name="source" defaultValue="other" className={SELECT_CLASS}>
                {LEAD_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {t(`source.${s}`)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5 sm:col-span-2">
              <span className="text-sm font-medium text-ink">{t("fields.owner")}</span>
              <select name="ownerId" defaultValue="" className={SELECT_CLASS}>
                <option value="">{t("fields.unassigned")}</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-ink">{t("fields.notes")}</span>
            <textarea
              name="notes"
              rows={3}
              className="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
            />
          </label>

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

      {leads.length === 0 ? (
        <Card>
          <CardBody className="py-10 text-center text-sm text-ink-muted">{t("empty")}</CardBody>
        </Card>
      ) : null}
    </div>
  );
}
