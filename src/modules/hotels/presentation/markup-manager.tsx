"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { LuPencil } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { deleteMarkupRuleAction, saveMarkupRuleAction } from "./supplier-actions";
import { AddButton, DeleteButton, FormModal, Select } from "./hotel-forms";

type Rule = {
  id: string;
  scope: string;
  agencyId: string | null;
  hotelId: string | null;
  markupType: string;
  markupValue: number;
  note: string | null;
};

type Option = { id: string; label: string };

/**
 * Markup rules (CLAUDE.md §15, decision 7.1).
 *
 * Resolution is most-specific-first — agency+hotel, then hotel, then agency,
 * then global — and the form makes the scope explicit rather than inferring it
 * from which fields happen to be filled, because an ambiguous scope would mean
 * an ambiguous price.
 */
function RuleFields({
  rule,
  agencies,
  hotels,
}: {
  rule?: Rule;
  agencies: Option[];
  hotels: Option[];
}) {
  const t = useTranslations("markup.fields");
  const tScope = useTranslations("markup.scope");
  const tType = useTranslations("hotels.chargeType");
  const [scope, setScope] = useState(rule?.scope ?? "agency");

  const needsAgency = scope === "agency" || scope === "agency_hotel";
  const needsHotel = scope === "hotel" || scope === "agency_hotel";

  return (
    <>
      {rule ? <input type="hidden" name="ruleId" value={rule.id} /> : null}

      <div className="flex w-full flex-col gap-1.5">
        <label htmlFor="markup-scope" className="text-sm font-medium text-ink">
          {t("scope")}
        </label>
        <select
          id="markup-scope"
          name="scope"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="h-9 w-full cursor-pointer rounded-control border border-border-strong bg-surface px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
        >
          {(["global", "agency", "hotel", "agency_hotel"] as const).map((s) => (
            <option key={s} value={s}>
              {tScope(s)}
            </option>
          ))}
        </select>
        <p className="text-xs text-ink-muted">{t("scopeHint")}</p>
      </div>

      {/* Only the selectors the chosen scope actually uses are rendered, and
          the unused ones submit empty so the server-side scope check passes. */}
      {needsAgency ? (
        <Select name="agencyId" required label={t("agency")} defaultValue={rule?.agencyId ?? ""}>
          <option value="">{t("selectAgency")}</option>
          {agencies.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </Select>
      ) : (
        <input type="hidden" name="agencyId" value="" />
      )}

      {needsHotel ? (
        <Select name="hotelId" required label={t("hotel")} defaultValue={rule?.hotelId ?? ""}>
          <option value="">{t("selectHotel")}</option>
          {hotels.map((h) => (
            <option key={h.id} value={h.id}>
              {h.label}
            </option>
          ))}
        </Select>
      ) : (
        <input type="hidden" name="hotelId" value="" />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          name="markupType"
          required
          label={t("markupType")}
          defaultValue={rule?.markupType ?? "percentage"}
        >
          <option value="percentage">{tType("percentage")}</option>
          <option value="fixed">{tType("fixed")}</option>
        </Select>
        <Input
          name="markupValue"
          type="number"
          step="0.01"
          min="0"
          required
          dir="ltr"
          defaultValue={rule?.markupValue}
          label={t("markupValue")}
        />
      </div>

      <Input name="note" defaultValue={rule?.note ?? ""} label={t("note")} />
    </>
  );
}

export function AddMarkupButton({ agencies, hotels }: { agencies: Option[]; hotels: Option[] }) {
  const t = useTranslations("markup");
  return (
    <AddButton
      label={t("add")}
      title={t("addTitle")}
      description={t("addDescription")}
      action={saveMarkupRuleAction}
      size="md"
    >
      <RuleFields agencies={agencies} hotels={hotels} />
    </AddButton>
  );
}

export function MarkupRowActions({
  rule,
  agencies,
  hotels,
  locale,
}: {
  rule: Rule;
  agencies: Option[];
  hotels: Option[];
  locale: Locale;
}) {
  const t = useTranslations("markup");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="ghost" size="sm" aria-label={t("editLabel")} onClick={() => setOpen(true)}>
        <LuPencil aria-hidden />
      </Button>
      <FormModal
        open={open}
        onOpenChange={setOpen}
        title={t("editTitle")}
        action={saveMarkupRuleAction}
        submitLabel={tCommon("save")}
        size="md"
      >
        <RuleFields rule={rule} agencies={agencies} hotels={hotels} />
      </FormModal>

      {/* The global rule is the floor under every quote; removing it would
          silently sell at cost, so it has no delete control. */}
      {rule.scope !== "global" ? (
        <DeleteButton
          locale={locale}
          label={t("deleteLabel")}
          title={t("deleteConfirmTitle")}
          body={t("deleteConfirmBody")}
          onConfirm={() => deleteMarkupRuleAction(rule.id)}
        />
      ) : null}
    </div>
  );
}
