"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { LuExternalLink, LuLayers, LuSparkles, LuCircleHelp, LuMegaphone } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { Link } from "@/shared/i18n/navigation";
import { formatDate } from "@/shared/lib/format";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Card, CardBody, CardHeader } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { saveHomepageContentAction } from "./cms-actions";
import type { AdminHomepageContent } from "@/modules/cms/infrastructure/content.repository";

type TabKey = "hero" | "features" | "how" | "cta";

export function HomepageEditor({
  content,
  locale,
}: {
  content: AdminHomepageContent;
  locale: Locale;
}) {
  const t = useTranslations("cms.home");
  const tCommon = useTranslations("common");
  const [activeTab, setActiveTab] = useState<TabKey>("hero");
  const [pending, startTransition] = useTransition();

  // Controlled form state for side-by-side editing
  const [formData, setFormData] = useState<AdminHomepageContent>(content);

  function updateField<K extends keyof AdminHomepageContent>(key: K, value: AdminHomepageContent[K]) {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  function updateFeature(
    index: number,
    field: "titleAr" | "titleEn" | "bodyAr" | "bodyEn",
    value: string,
  ) {
    setFormData((prev) => {
      const nextFeatures = [...prev.features];
      if (nextFeatures[index]) {
        nextFeatures[index] = { ...nextFeatures[index]!, [field]: value };
      }
      return { ...prev, features: nextFeatures };
    });
  }

  function updateStep(
    index: number,
    field: "titleAr" | "titleEn" | "bodyAr" | "bodyEn",
    value: string,
  ) {
    setFormData((prev) => {
      const nextSteps = [...prev.howSteps];
      if (nextSteps[index]) {
        nextSteps[index] = { ...nextSteps[index]!, [field]: value };
      }
      return { ...prev, howSteps: nextSteps };
    });
  }

  const handleSave = () => {
    startTransition(async () => {
      const res = await saveHomepageContentAction({
        heroEyebrowAr: formData.heroEyebrowAr,
        heroEyebrowEn: formData.heroEyebrowEn,
        heroTitleAr: formData.heroTitleAr,
        heroTitleEn: formData.heroTitleEn,
        heroSubtitleAr: formData.heroSubtitleAr,
        heroSubtitleEn: formData.heroSubtitleEn,

        featuresTitleAr: formData.featuresTitleAr,
        featuresTitleEn: formData.featuresTitleEn,
        featuresSubtitleAr: formData.featuresSubtitleAr,
        featuresSubtitleEn: formData.featuresSubtitleEn,
        features: formData.features,

        howTitleAr: formData.howTitleAr,
        howTitleEn: formData.howTitleEn,
        howSteps: formData.howSteps,

        ctaTitleAr: formData.ctaTitleAr,
        ctaTitleEn: formData.ctaTitleEn,
        ctaBodyAr: formData.ctaBodyAr,
        ctaBodyEn: formData.ctaBodyEn,
        ctaButtonAr: formData.ctaButtonAr,
        ctaButtonEn: formData.ctaButtonEn,
      });

      if (res.ok) {
        toast.success({ title: t("saved") });
      } else {
        console.error("[HomepageEditor] save failed:", res);
        toast.error({
          title: t("saveFailed"),
          description: res.detail ?? (res.errorKey ? tCommon("errors.unexpected") : undefined),
        });
      }
    });
  };

  const tabs: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "hero", label: t("tabs.hero"), icon: LuSparkles },
    { key: "features", label: t("tabs.features"), icon: LuLayers },
    { key: "how", label: t("tabs.how"), icon: LuCircleHelp },
    { key: "cta", label: t("tabs.cta"), icon: LuMegaphone },
  ];

  return (
    <Card>
      <CardHeader
        title={t("title")}
        description={`${t("lastUpdated")}: ${formatDate(formData.updatedAt, locale)}`}
        actions={
          <div className="flex items-center gap-3">
            <Link
              href="/"
              target="_blank"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
            >
              <LuExternalLink className="size-4" aria-hidden />
              {t("viewPublic")}
            </Link>
            <Button onClick={handleSave} loading={pending} size="sm">
              {tCommon("save")}
            </Button>
          </div>
        }
      />
      <CardBody className="space-y-6">
        {/* Navigation Tabs */}
        <nav aria-label={t("title")}>
          <ul className="flex flex-wrap gap-2 border-b border-border pb-3">
            {tabs.map(({ key, label, icon: Icon }) => (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => setActiveTab(key)}
                  aria-current={activeTab === key ? "page" : undefined}
                  className={
                    "inline-flex cursor-pointer items-center gap-2 rounded-control px-3.5 py-2 text-sm font-medium transition-colors " +
                    (activeTab === key
                      ? "bg-brand-600 text-ink-inverse shadow-xs"
                      : "text-ink-muted hover:bg-surface-hover hover:text-ink")
                  }
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* -------------------------------------------------------- TAB: HERO */}
        {activeTab === "hero" ? (
          <div className="space-y-6">
            <div className="space-y-1">
              <h3 className="font-semibold text-ink">{t("hero.heading")}</h3>
              <p className="text-xs text-ink-muted">{t("hero.helper")}</p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <Input
                label={t("hero.eyebrowAr")}
                value={formData.heroEyebrowAr}
                onChange={(e) => updateField("heroEyebrowAr", e.target.value)}
                dir="rtl"
                required
              />
              <Input
                label={t("hero.eyebrowEn")}
                value={formData.heroEyebrowEn}
                onChange={(e) => updateField("heroEyebrowEn", e.target.value)}
                dir="ltr"
                required
              />
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <Input
                label={t("hero.titleAr")}
                value={formData.heroTitleAr}
                onChange={(e) => updateField("heroTitleAr", e.target.value)}
                dir="rtl"
                required
              />
              <Input
                label={t("hero.titleEn")}
                value={formData.heroTitleEn}
                onChange={(e) => updateField("heroTitleEn", e.target.value)}
                dir="ltr"
                required
              />
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink">{t("hero.subtitleAr")}</label>
                <textarea
                  rows={4}
                  value={formData.heroSubtitleAr}
                  onChange={(e) => updateField("heroSubtitleAr", e.target.value)}
                  dir="rtl"
                  className="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink">{t("hero.subtitleEn")}</label>
                <textarea
                  rows={4}
                  value={formData.heroSubtitleEn}
                  onChange={(e) => updateField("heroSubtitleEn", e.target.value)}
                  dir="ltr"
                  className="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
                  required
                />
              </div>
            </div>
          </div>
        ) : null}

        {/* ---------------------------------------------------- TAB: FEATURES */}
        {activeTab === "features" ? (
          <div className="space-y-6">
            <div className="space-y-1">
              <h3 className="font-semibold text-ink">{t("features.heading")}</h3>
              <p className="text-xs text-ink-muted">{t("features.helper")}</p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <Input
                label={t("features.titleAr")}
                value={formData.featuresTitleAr}
                onChange={(e) => updateField("featuresTitleAr", e.target.value)}
                dir="rtl"
                required
              />
              <Input
                label={t("features.titleEn")}
                value={formData.featuresTitleEn}
                onChange={(e) => updateField("featuresTitleEn", e.target.value)}
                dir="ltr"
                required
              />
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <Input
                label={t("features.subtitleAr")}
                value={formData.featuresSubtitleAr}
                onChange={(e) => updateField("featuresSubtitleAr", e.target.value)}
                dir="rtl"
                required
              />
              <Input
                label={t("features.subtitleEn")}
                value={formData.featuresSubtitleEn}
                onChange={(e) => updateField("featuresSubtitleEn", e.target.value)}
                dir="ltr"
                required
              />
            </div>

            <div className="space-y-4 pt-4 border-t border-border">
              <h4 className="text-sm font-semibold text-ink">{t("features.cardsHeading")}</h4>
              <div className="space-y-5">
                {formData.features.map((feature, idx) => (
                  <div
                    key={feature.key}
                    className="rounded-control border border-border bg-surface-sunken/40 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-border/60 pb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-brand-700">
                        {t(`features.keys.${feature.key}`) || feature.key}
                      </span>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <Input
                        label={`${t("features.cardTitle")} (AR)`}
                        value={feature.titleAr}
                        onChange={(e) => updateFeature(idx, "titleAr", e.target.value)}
                        dir="rtl"
                        required
                      />
                      <Input
                        label={`${t("features.cardTitle")} (EN)`}
                        value={feature.titleEn}
                        onChange={(e) => updateFeature(idx, "titleEn", e.target.value)}
                        dir="ltr"
                        required
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-ink">
                          {`${t("features.cardBody")} (AR)`}
                        </label>
                        <textarea
                          rows={2}
                          value={feature.bodyAr}
                          onChange={(e) => updateFeature(idx, "bodyAr", e.target.value)}
                          dir="rtl"
                          className="w-full rounded-control border border-border bg-surface px-3 py-1.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-ink">
                          {`${t("features.cardBody")} (EN)`}
                        </label>
                        <textarea
                          rows={2}
                          value={feature.bodyEn}
                          onChange={(e) => updateFeature(idx, "bodyEn", e.target.value)}
                          dir="ltr"
                          className="w-full rounded-control border border-border bg-surface px-3 py-1.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
                          required
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {/* --------------------------------------------------------- TAB: HOW */}
        {activeTab === "how" ? (
          <div className="space-y-6">
            <div className="space-y-1">
              <h3 className="font-semibold text-ink">{t("how.heading")}</h3>
              <p className="text-xs text-ink-muted">{t("how.helper")}</p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <Input
                label={t("how.titleAr")}
                value={formData.howTitleAr}
                onChange={(e) => updateField("howTitleAr", e.target.value)}
                dir="rtl"
                required
              />
              <Input
                label={t("how.titleEn")}
                value={formData.howTitleEn}
                onChange={(e) => updateField("howTitleEn", e.target.value)}
                dir="ltr"
                required
              />
            </div>

            <div className="space-y-4 pt-4 border-t border-border">
              <h4 className="text-sm font-semibold text-ink">{t("how.stepsHeading")}</h4>
              <div className="space-y-5">
                {formData.howSteps.map((stepItem, idx) => (
                  <div
                    key={stepItem.step}
                    className="rounded-control border border-border bg-surface-sunken/40 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-border/60 pb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-brand-700">
                        {t("how.stepLabel", { number: idx + 1 })}
                      </span>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <Input
                        label={`${t("how.stepTitle")} (AR)`}
                        value={stepItem.titleAr}
                        onChange={(e) => updateStep(idx, "titleAr", e.target.value)}
                        dir="rtl"
                        required
                      />
                      <Input
                        label={`${t("how.stepTitle")} (EN)`}
                        value={stepItem.titleEn}
                        onChange={(e) => updateStep(idx, "titleEn", e.target.value)}
                        dir="ltr"
                        required
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-ink">
                          {`${t("how.stepBody")} (AR)`}
                        </label>
                        <textarea
                          rows={2}
                          value={stepItem.bodyAr}
                          onChange={(e) => updateStep(idx, "bodyAr", e.target.value)}
                          dir="rtl"
                          className="w-full rounded-control border border-border bg-surface px-3 py-1.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-ink">
                          {`${t("how.stepBody")} (EN)`}
                        </label>
                        <textarea
                          rows={2}
                          value={stepItem.bodyEn}
                          onChange={(e) => updateStep(idx, "bodyEn", e.target.value)}
                          dir="ltr"
                          className="w-full rounded-control border border-border bg-surface px-3 py-1.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
                          required
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {/* --------------------------------------------------------- TAB: CTA */}
        {activeTab === "cta" ? (
          <div className="space-y-6">
            <div className="space-y-1">
              <h3 className="font-semibold text-ink">{t("cta.heading")}</h3>
              <p className="text-xs text-ink-muted">{t("cta.helper")}</p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <Input
                label={t("cta.titleAr")}
                value={formData.ctaTitleAr}
                onChange={(e) => updateField("ctaTitleAr", e.target.value)}
                dir="rtl"
                required
              />
              <Input
                label={t("cta.titleEn")}
                value={formData.ctaTitleEn}
                onChange={(e) => updateField("ctaTitleEn", e.target.value)}
                dir="ltr"
                required
              />
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink">{t("cta.bodyAr")}</label>
                <textarea
                  rows={3}
                  value={formData.ctaBodyAr}
                  onChange={(e) => updateField("ctaBodyAr", e.target.value)}
                  dir="rtl"
                  className="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink">{t("cta.bodyEn")}</label>
                <textarea
                  rows={3}
                  value={formData.ctaBodyEn}
                  onChange={(e) => updateField("ctaBodyEn", e.target.value)}
                  dir="ltr"
                  className="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
                  required
                />
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <Input
                label={t("cta.buttonAr")}
                value={formData.ctaButtonAr}
                onChange={(e) => updateField("ctaButtonAr", e.target.value)}
                dir="rtl"
                required
              />
              <Input
                label={t("cta.buttonEn")}
                value={formData.ctaButtonEn}
                onChange={(e) => updateField("ctaButtonEn", e.target.value)}
                dir="ltr"
                required
              />
            </div>
          </div>
        ) : null}

        {/* Footer save action */}
        <div className="flex justify-end pt-4 border-t border-border">
          <Button onClick={handleSave} loading={pending}>
            {tCommon("save")}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
