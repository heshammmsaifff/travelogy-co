import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden } from "next/navigation";
import type { Locale } from "@/shared/i18n/config";
import { can } from "@/modules/auth/domain/user";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import {
  getAdminHomepageContent,
  listAllBanners,
  listContentPages,
} from "@/modules/cms/infrastructure/content.repository";
import { CmsTabs } from "@/modules/cms/presentation/cms-tabs";

/**
 * The CMS (CLAUDE.md §13, Phase 6).
 *
 * Provides control over:
 * 1. Homepage content (Hero, Features, How It Works, CTA)
 * 2. Homepage promotional banners
 * 3. Static content pages (About, Terms, Privacy)
 */
export default async function ContentPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user || !can(user, "cms.content.publish")) forbidden();

  const t = await getTranslations("cms");
  const [homepageContent, banners, pages] = await Promise.all([
    getAdminHomepageContent(),
    listAllBanners(),
    listContentPages(),
  ]);

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("title")}</h1>
        <p className="max-w-prose text-sm text-ink-muted">{t("description")}</p>
      </div>

      <CmsTabs
        homepageContent={homepageContent}
        banners={banners}
        pages={pages}
        locale={locale}
      />
    </main>
  );
}
