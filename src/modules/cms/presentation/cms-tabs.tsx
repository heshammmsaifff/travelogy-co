"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { LuLayoutTemplate, LuImage, LuFileText } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import type { AdminBanner, AdminContentPage, AdminHomepageContent } from "@/modules/cms/infrastructure/content.repository";
import { HomepageEditor } from "./homepage-editor";
import { BannerManager } from "./banner-manager";
import { ContentEditor } from "./content-editor";

type CmsSection = "home" | "banners" | "pages";

export function CmsTabs({
  homepageContent,
  banners,
  pages,
  locale,
}: {
  homepageContent: AdminHomepageContent | null;
  banners: AdminBanner[];
  pages: AdminContentPage[];
  locale: Locale;
}) {
  const t = useTranslations("cms");
  const [activeSection, setActiveSection] = useState<CmsSection>("home");

  const sections: { key: CmsSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "home", label: t("homeTab"), icon: LuLayoutTemplate },
    { key: "banners", label: t("bannersTab"), icon: LuImage },
    { key: "pages", label: t("pagesTab"), icon: LuFileText },
  ];

  return (
    <div className="space-y-6">
      <nav aria-label={t("title")}>
        <ul className="flex flex-wrap gap-2 border-b border-border pb-3">
          {sections.map(({ key, label, icon: Icon }) => (
            <li key={key}>
              <button
                type="button"
                onClick={() => setActiveSection(key)}
                aria-current={activeSection === key ? "page" : undefined}
                className={
                  "inline-flex cursor-pointer items-center gap-2 rounded-control px-4 py-2 text-sm font-medium transition-colors " +
                  (activeSection === key
                    ? "bg-brand-600 text-ink-inverse shadow-xs"
                    : "bg-surface text-ink-muted hover:bg-surface-hover hover:text-ink border border-border")
                }
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {activeSection === "home" && homepageContent ? (
        <HomepageEditor content={homepageContent} locale={locale} />
      ) : null}

      {activeSection === "banners" ? (
        <BannerManager banners={banners} locale={locale} />
      ) : null}

      {activeSection === "pages" ? (
        <ContentEditor pages={pages} locale={locale} />
      ) : null}
    </div>
  );
}
