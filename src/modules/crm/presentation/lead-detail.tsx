"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { LuBuilding2, LuTrash2, LuTrophy } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { useRouter } from "@/shared/i18n/navigation";
import { confirmAction } from "@/shared/lib/confirm";
import { toast } from "@/shared/lib/toast";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardBody, CardHeader } from "@/shared/ui/card";
import { CountrySelect } from "@/shared/ui/country-select";
import { Input } from "@/shared/ui/input";
import { PhoneInput } from "@/shared/ui/phone-input";
import { Modal } from "@/shared/ui/modal";
import { LEAD_SOURCES, LEAD_STAGES } from "@/modules/crm/domain/crm";
import type { Lead } from "@/modules/crm/infrastructure/crm.repository";
import { convertLeadAction, deleteLeadAction, saveLeadAction, type Result } from "./crm-actions";

const SELECT_CLASS =
  "h-9 w-full cursor-pointer rounded-control border border-border bg-surface px-2.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus";

function useShow() {
  const t = useTranslations();
  return (result: Result) => {
    if (result.ok) toast.success({ title: t(result.messageKey) });
    else toast.error({ title: t(result.errorKey), description: result.detail });
    return result.ok;
  };
}

/**
 * One prospect (CLAUDE.md §13, Phase 8d).
 *
 * `won` is absent from the stage dropdown on purpose. Winning a lead means
 * linking it to an agency that registered and was approved through the normal
 * route, which is `convert_lead`'s job — the CRM never creates an agency, and
 * a dropdown that set the stage without the link would produce a row the
 * database refuses anyway.
 */
export function LeadDetail({
  lead,
  owners,
  linkableAgencies,
  locale,
}: {
  lead: Lead;
  owners: { id: string; name: string }[];
  linkableAgencies: { id: string; name: string; code: string }[];
  locale: Locale;
}) {
  const t = useTranslations("crm");
  const tCommon = useTranslations("common");
  const [converting, setConverting] = useState(false);
  const [stage, setStage] = useState(lead.stage);
  const [pending, startTransition] = useTransition();
  const show = useShow();
  const router = useRouter();

  // Everything except `won`, which is reached only by converting.
  const selectableStages = LEAD_STAGES.filter((s) => s !== "won");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={t("fields.companyName")}
          actions={
            <div className="flex flex-wrap gap-2">
              {lead.stage === "won" ? null : (
                <Button size="sm" variant="secondary" onClick={() => setConverting(true)}>
                  <LuTrophy aria-hidden />
                  {t("convert")}
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
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
                    if (show(await deleteLeadAction(lead.id))) router.push("/admin/crm");
                  });
                }}
              >
                <LuTrash2 aria-hidden />
              </Button>
            </div>
          }
        />

        <CardBody>
          {lead.stage === "won" ? (
            <p className="mb-4 flex flex-wrap items-center gap-2 rounded-control bg-success-50 px-3 py-2 text-sm text-success-700">
              <LuBuilding2 className="size-4 shrink-0" aria-hidden />
              {t("wonAs", { agency: lead.wonAgencyName ?? lead.wonAgencyCode ?? "—" })}
              {/* The snapshot outlives the link, so say which is which rather
                  than showing a name that no longer resolves to anything. */}
              {lead.agencyId ? null : (
                <Badge tone="neutral">{t("wonAgencyGone")}</Badge>
              )}
            </p>
          ) : null}

          <form
            action={(fd) =>
              startTransition(async () => {
                if (show(await saveLeadAction(fd))) router.refresh();
              })
            }
            className="space-y-4"
          >
            <input type="hidden" name="id" value={lead.id} />
            {/* A won lead keeps its stage: the form cannot set it, so it has
                to be carried, or saving any other field would move it. */}
            {lead.stage === "won" ? <input type="hidden" name="stage" value="won" /> : null}

            <Input
              name="companyName"
              required
              defaultValue={lead.companyName}
              label={t("fields.companyName")}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                name="contactName"
                defaultValue={lead.contactName ?? ""}
                label={t("fields.contactName")}
              />
              <Input
                name="email"
                type="email"
                dir="ltr"
                defaultValue={lead.email ?? ""}
                label={t("fields.email")}
              />
              <PhoneInput
                name="phone"
                defaultValue={lead.phone ?? ""}
                label={t("fields.phone")}
              />
              <Input name="city" defaultValue={lead.city ?? ""} label={t("fields.city")} />

              <CountrySelect
                name="countryCode"
                label={t("fields.country")}
                defaultValue={lead.countryCode ?? ""}
              />

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-ink">{t("fields.sourceLabel")}</span>
                <select name="source" defaultValue={lead.source} className={SELECT_CLASS}>
                  {LEAD_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {t(`source.${s}`)}
                    </option>
                  ))}
                </select>
              </label>

              {lead.stage === "won" ? null : (
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-ink">{t("fields.stageLabel")}</span>
                  <select
                    name="stage"
                    value={stage}
                    onChange={(e) => setStage(e.target.value as Lead["stage"])}
                    className={SELECT_CLASS}
                  >
                    {selectableStages.map((s) => (
                      <option key={s} value={s}>
                        {t(`stage.${s}`)}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-ink">{t("fields.owner")}</span>
                <select name="ownerId" defaultValue={lead.ownerId ?? ""} className={SELECT_CLASS}>
                  <option value="">{t("fields.unassigned")}</option>
                  {owners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Only asked for when it is required, and it IS required — the
                table refuses a lost lead with no reason. */}
            {stage === "lost" ? (
              <Input
                name="lostReason"
                required
                defaultValue={lead.lostReason ?? ""}
                label={t("fields.lostReason")}
              />
            ) : null}

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-ink">{t("fields.notes")}</span>
              <textarea
                name="notes"
                rows={4}
                defaultValue={lead.notes ?? ""}
                className="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
              />
            </label>

            <div className="flex justify-end border-t border-border pt-4">
              <Button type="submit" size="sm" loading={pending}>
                {tCommon("save")}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Modal
        open={converting}
        onOpenChange={setConverting}
        title={t("convertTitle")}
        description={t("convertBody")}
        closeLabel={tCommon("cancel")}
        size="md"
      >
        {linkableAgencies.length === 0 ? (
          <div className="space-y-4">
            <p className="rounded-control bg-warning-50 px-3 py-2 text-sm text-warning-700">
              {t("convertNoAgencies")}
            </p>
            <div className="flex justify-end">
              <Button size="sm" variant="secondary" onClick={() => setConverting(false)}>
                {tCommon("cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <form
            action={(fd) =>
              startTransition(async () => {
                if (show(await convertLeadAction(fd))) {
                  setConverting(false);
                  router.refresh();
                }
              })
            }
            className="space-y-4"
          >
            <input type="hidden" name="leadId" value={lead.id} />

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-ink">{t("fields.agency")}</span>
              <select name="agencyId" required defaultValue="" className={SELECT_CLASS}>
                <option value="" disabled>
                  —
                </option>
                {linkableAgencies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.code})
                  </option>
                ))}
              </select>
            </label>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="secondary" size="sm" onClick={() => setConverting(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="submit" size="sm" loading={pending}>
                {t("convert")}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
