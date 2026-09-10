import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import Image from "next/image";
import {
  LuArrowLeft,
  LuArrowRight,
  LuBedDouble,
  LuFileText,
  LuLayoutDashboard,
  LuUsers,
  LuWallet,
} from "react-icons/lu";
import type { IconType } from "react-icons";
import { Link } from "@/shared/i18n/navigation";
import { isLocale, LOCALE_META } from "@/shared/i18n/config";
import { cloudinaryUrl } from "@/shared/lib/media";
import { buttonVariants } from "@/shared/ui/button-variants";
import {
  getActiveBanners,
  getHomepageContent,
} from "@/modules/cms/infrastructure/content.repository";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { landingPathFor } from "@/modules/auth/domain/user";
import {
  ScrollReveal,
  ScrollStaggerList,
  ScrollStaggerOrderedList,
  ScrollStaggerItem,
} from "@/shared/ui/scroll-reveal";

/**
 * Public homepage (CLAUDE.md §13, Phase 4).
 *
 * The banner strip is data-driven from the `banners` table so Phase 6's CMS
 * only has to add the editing screen. With no banners loaded the section is
 * omitted entirely rather than rendering an empty carousel — the rest of the
 * page is a complete homepage on its own.
 */

const FEATURES: { key: string; icon: IconType }[] = [
  { key: "inventory", icon: LuBedDouble },
  { key: "credit", icon: LuWallet },
  { key: "quotations", icon: LuFileText },
  { key: "team", icon: LuUsers },
];

const STEPS = ["step1", "step2", "step3", "step4"] as const;

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  // A page renders concurrently with its layout, so the layout's notFound()
  // does not protect this from `/favicon.ico` arriving as a "locale".
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations("site");
  const tNav = await getTranslations("site.nav");
  const { dir } = LOCALE_META[locale];
  // Arrow direction is content, not decoration — it mirrors with the locale.
  const Arrow = dir === "rtl" ? LuArrowLeft : LuArrowRight;

  const [banners, user, customContent] = await Promise.all([
    getActiveBanners(locale),
    getCurrentUser(),
    getHomepageContent(locale),
  ]);

  const dashboardPath = user ? landingPathFor(user) : null;
  const dashboardLabel = user
    ? user.role.scope === "admin"
      ? tNav("dashboardAdmin")
      : user.role.scope === "driver"
        ? tNav("dashboardDriver")
        : tNav("dashboardAgent")
    : tNav("dashboard");

  const heroEyebrow = customContent?.hero.eyebrow || t("hero.eyebrow");
  const heroTitle = customContent?.hero.title || t("hero.title");
  const heroSubtitle = customContent?.hero.subtitle || t("hero.subtitle");

  const featuresTitle = customContent?.features.title || t("features.title");
  const featuresDescription = customContent?.features.description || t("features.description");
  const featureMap = new Map((customContent?.features.items ?? []).map((i) => [i.key, i]));

  const howTitle = customContent?.how.title || t("how.title");
  const stepMap = new Map((customContent?.how.steps ?? []).map((s) => [s.step, s]));

  const ctaTitle = customContent?.cta.title || t("cta.title");
  const ctaBody = customContent?.cta.body || t("cta.body");
  const ctaButton = customContent?.cta.button || t("cta.button");

  return (
    <main className="bg-canvas">
      {/* ------------------------------------------------------------- hero */}
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-surface to-canvas py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <ScrollReveal delay={0.05} yOffset={18} className="max-w-2xl space-y-6">
            <p className="inline-flex items-center gap-2 rounded-full border border-gold-300 bg-gold-50/90 px-3.5 py-1 text-xs font-semibold text-gold-900 shadow-2xs">
              <span className="size-1.5 rounded-full bg-gold-600" aria-hidden />
              {heroEyebrow}
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-balance text-ink sm:text-5xl lg:text-6xl font-sans">
              {heroTitle}
            </h1>
            <p className="max-w-prose text-base text-pretty text-ink-muted sm:text-lg leading-relaxed">
              {heroSubtitle}
            </p>
            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              {user && dashboardPath ? (
                <>
                  <Link href={dashboardPath} className={buttonVariants({ variant: "gold", size: "lg" })}>
                    <LuLayoutDashboard className="size-5" aria-hidden />
                    {dashboardLabel}
                    <Arrow aria-hidden />
                  </Link>
                  <Link
                    href="/about"
                    className={buttonVariants({ size: "lg", variant: "secondary" })}
                  >
                    {tNav("about")}
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/register" className={buttonVariants({ variant: "gold", size: "lg" })}>
                    {t("hero.ctaPrimary")}
                    <Arrow aria-hidden />
                  </Link>
                  <Link
                    href="/login"
                    className={buttonVariants({ size: "lg", variant: "secondary" })}
                  >
                    {t("hero.ctaSecondary")}
                  </Link>
                </>
              )}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* --------------------------------------------------------- banners */}
      {banners.length > 0 ? (
        <section className="border-b border-border bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
            <ScrollStaggerList className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {banners.map((banner) => (
                <ScrollStaggerItem
                  key={banner.id}
                  className="overflow-hidden rounded-card border border-border bg-surface shadow-xs transition-shadow hover:shadow-card"
                >
                  {banner.imagePublicId ? (
                    <Image
                      src={cloudinaryUrl(banner.imagePublicId, {
                        width: 800,
                        height: 400,
                        crop: "fill",
                      })}
                      alt=""
                      width={400}
                      height={200}
                      unoptimized
                      className="h-40 w-full object-cover"
                    />
                  ) : null}
                  <div className="space-y-1.5 p-4">
                    <p className="font-semibold text-ink">{banner.title}</p>
                    {banner.subtitle ? (
                      <p className="text-sm text-ink-muted">{banner.subtitle}</p>
                    ) : null}
                    {banner.ctaHref && banner.ctaLabel ? (
                      <a
                        href={banner.ctaHref}
                        className={buttonVariants({ variant: "ghost", size: "sm" })}
                      >
                        {banner.ctaLabel}
                        <Arrow aria-hidden />
                      </a>
                    ) : null}
                  </div>
                </ScrollStaggerItem>
              ))}
            </ScrollStaggerList>
          </div>
        </section>
      ) : null}

      {/* -------------------------------------------------------- features */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-6xl space-y-10 px-4 py-16 sm:px-6 sm:py-20">
          <ScrollReveal className="max-w-2xl space-y-2">
            <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl font-sans">
              {featuresTitle}
            </h2>
            <p className="text-ink-muted">{featuresDescription}</p>
          </ScrollReveal>

          <ScrollStaggerList className="grid gap-6 sm:grid-cols-2">
            {FEATURES.map(({ key, icon: Icon }) => {
              const custom = featureMap.get(key);
              const title = custom?.title || t(`features.${key}.title`);
              const body = custom?.body || t(`features.${key}.body`);
              return (
                <ScrollStaggerItem
                  key={key}
                  className="flex gap-4 rounded-card border border-border/80 bg-canvas/60 p-5 shadow-xs transition-all hover:border-gold-300 hover:bg-surface"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-card bg-[#063B4A] text-[#D8AE4A] shadow-xs">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0 space-y-1">
                    <h3 className="font-semibold text-ink">{title}</h3>
                    <p className="text-sm text-pretty text-ink-muted leading-relaxed">{body}</p>
                  </div>
                </ScrollStaggerItem>
              );
            })}
          </ScrollStaggerList>
        </div>
      </section>

      {/* ------------------------------------------------------ how it works */}
      <section className="border-b border-border bg-surface-sunken">
        <div className="mx-auto max-w-6xl space-y-10 px-4 py-16 sm:px-6 sm:py-20">
          <ScrollReveal>
            <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl font-sans">
              {howTitle}
            </h2>
          </ScrollReveal>

          <ScrollStaggerOrderedList className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => {
              const custom = stepMap.get(step);
              const title = custom?.title || t(`how.${step}.title`);
              const body = custom?.body || t(`how.${step}.body`);
              return (
                <ScrollStaggerItem
                  key={step}
                  className="space-y-3 rounded-card border border-border/60 bg-surface p-5 shadow-xs"
                >
                  <span className="flex size-8 items-center justify-center rounded-full bg-[#063B4A] text-sm font-bold text-[#D8AE4A] border border-[#D8AE4A]/30 tabular-nums">
                    {index + 1}
                  </span>
                  <h3 className="font-semibold text-ink">{title}</h3>
                  <p className="text-sm text-pretty text-ink-muted leading-relaxed">{body}</p>
                </ScrollStaggerItem>
              );
            })}
          </ScrollStaggerOrderedList>
        </div>
      </section>

      {/* -------------------------------------------------------------- cta */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <ScrollReveal
            yOffset={24}
            className="relative overflow-hidden rounded-card border border-[#042D39] bg-[#063B4A] p-8 sm:p-12 shadow-raised text-white"
          >
            {/* Ambient gold aura */}
            <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-[#D8AE4A]/10 blur-3xl pointer-events-none" />

            <div className="relative z-10 flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2 max-w-2xl">
                <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl font-sans">
                  {ctaTitle}
                </h2>
                <p className="text-sm text-slate-200 leading-relaxed max-w-xl">
                  {ctaBody}
                </p>
              </div>
              {user && dashboardPath ? (
                <Link
                  href={dashboardPath}
                  className={buttonVariants({ variant: "gold", size: "lg", className: "shrink-0" })}
                >
                  <LuLayoutDashboard className="size-5" aria-hidden />
                  {t("cta.goToDashboard")}
                  <Arrow aria-hidden />
                </Link>
              ) : (
                <Link
                  href="/register"
                  className={buttonVariants({ variant: "gold", size: "lg", className: "shrink-0" })}
                >
                  {ctaButton}
                  <Arrow aria-hidden />
                </Link>
              )}
            </div>
          </ScrollReveal>
        </div>
      </section>
    </main>
  );
}
