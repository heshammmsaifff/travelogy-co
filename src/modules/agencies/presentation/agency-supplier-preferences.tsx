"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { Locale } from "@/shared/i18n/config";
import { toast } from "@/shared/lib/toast";
import { Switch } from "@/shared/ui/switch";
import { Badge } from "@/shared/ui/badge";
import { setAgencySupplierPreferenceAction } from "./agency-actions";

export type SupplierPreferenceItem = {
  providerKey: string;
  displayNameAr: string;
  displayNameEn: string;
  isEnabled: boolean;
  isGloballyEnabled: boolean;
};

export function AgencySupplierPreferences({
  agencyId,
  suppliers,
  locale,
  canEdit = true,
}: {
  agencyId: string;
  suppliers: SupplierPreferenceItem[];
  locale: Locale;
  canEdit?: boolean;
}) {
  const t = useTranslations("suppliers");
  const tCommon = useTranslations("common");
  const [, startTransition] = useTransition();
  const [preferences, setPreferences] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(suppliers.map((s) => [s.providerKey, s.isEnabled])),
  );

  const handleToggle = (providerKey: string, nextValue: boolean) => {
    setPreferences((prev) => ({ ...prev, [providerKey]: nextValue }));

    startTransition(async () => {
      const res = await setAgencySupplierPreferenceAction(agencyId, providerKey, nextValue);
      if (res.ok) {
        toast.success({ title: t("preferencesSaved") });
      } else {
        // Revert on error
        setPreferences((prev) => ({ ...prev, [providerKey]: !nextValue }));
        toast.error({ title: tCommon("errors.unexpected") });
      }
    });
  };

  if (suppliers.length === 0) {
    return <p className="text-sm text-ink-muted">{t("noSuppliersAvailable")}</p>;
  }

  return (
    <div className="divide-y divide-border">
      {suppliers.map((s) => {
        const enabled = preferences[s.providerKey] ?? s.isEnabled;
        const name = locale === "ar" ? s.displayNameAr : s.displayNameEn;

        return (
          <div
            key={s.providerKey}
            className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
          >
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-ink">{name}</span>
                {!s.isGloballyEnabled ? (
                  <Badge tone="neutral">{t("globallyDisabled")}</Badge>
                ) : null}
              </div>
              <p className="text-xs text-ink-muted">{s.providerKey}</p>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                checked={enabled}
                disabled={!canEdit || !s.isGloballyEnabled}
                onCheckedChange={(checked: boolean) => handleToggle(s.providerKey, checked)}
                aria-label={name}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
