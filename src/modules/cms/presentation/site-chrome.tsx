import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { LuLayoutDashboard } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { Link } from "@/shared/i18n/navigation";
import { LocaleSwitcher } from "@/shared/ui/locale-switcher";
import { buttonVariants } from "@/shared/ui/button-variants";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { landingPathFor } from "@/modules/auth/domain/user";
import { SignOutButton } from "@/modules/auth/presentation/sign-out-button";

/**
 * Header and footer for the public marketing site (CLAUDE.md §13, Phase 4).
 * Styled per Travelogy Brand Identity:
 * Deep navy background (#063B4A), gold monogram, white wordmark, restrained gold CTA.
 */

const NAV = [
  { key: "home", href: "/" },
  { key: "about", href: "/about" },
  { key: "terms", href: "/terms" },
  { key: "privacy", href: "/privacy" },
] as const;

import { SiteHeaderNav } from "@/modules/cms/presentation/site-header-nav";

export async function SiteHeader({ locale }: { locale: Locale }) {
  const t = await getTranslations("site.nav");
  const tApp = await getTranslations();
  const user = await getCurrentUser();

  const dashboardPath = user ? landingPathFor(user) : null;
  const dashboardLabel = user
    ? user.role.scope === "admin"
      ? t("dashboardAdmin")
      : user.role.scope === "driver"
        ? t("dashboardDriver")
        : t("dashboardAgent")
    : t("dashboard");

  const navItems = NAV.map(({ key, href }) => ({
    key,
    href,
    label: t(key),
  }));

  const userSummary = user
    ? {
        fullName: user.fullName,
        role: {
          scope: user.role.scope,
          nameAr: user.role.nameAr,
          nameEn: user.role.nameEn,
        },
      }
    : null;

  return (
    <header className="sticky top-0 z-30 border-b border-[#042D39] bg-[#063B4A] text-white shadow-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-x-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-3 group transition-opacity hover:opacity-95 shrink-0">
          <Image
            src="/logo.png"
            alt="Travelogy"
            width={40}
            height={28}
            className="h-8 w-auto object-contain brightness-110 drop-shadow-sm"
            priority
          />
          <div className="flex flex-col">
            <span className="text-lg font-bold tracking-tight text-white leading-none font-sans">
              Travelogy
            </span>
            <span className="text-[9px] tracking-widest text-[#D8AE4A] font-semibold uppercase mt-0.5">
              BOOK · CONNECT · GROW
            </span>
          </div>
        </Link>

        <SiteHeaderNav
          locale={locale}
          navItems={navItems}
          user={userSummary}
          dashboardPath={dashboardPath}
          dashboardLabel={dashboardLabel}
          loginLabel={t("login")}
          registerLabel={t("register")}
          languageLabel={tApp("common.language")}
        />
      </div>
    </header>
  );
}

export async function SiteFooter({ locale }: { locale?: Locale } = {}) {
  const t = await getTranslations("site");
  const tNav = await getTranslations("site.nav");
  const tApp = await getTranslations();
  const user = await getCurrentUser();

  const dashboardPath = user ? landingPathFor(user) : null;
  const dashboardLabel = user
    ? user.role.scope === "admin"
      ? tNav("dashboardAdmin")
      : user.role.scope === "driver"
        ? tNav("dashboardDriver")
        : tNav("dashboardAgent")
    : tNav("dashboard");

  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[#042D39] bg-[#042D39] text-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3 sm:px-6">
        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            <Image
              src="/logo.png"
              alt="Travelogy"
              width={36}
              height={24}
              className="h-7 w-auto object-contain brightness-110"
            />
            <div className="flex flex-col">
              <span className="text-base font-bold tracking-tight text-white leading-none">
                Travelogy
              </span>
              <span className="text-[8px] tracking-widest text-[#D8AE4A] font-semibold uppercase mt-0.5">
                BOOK · CONNECT · GROW
              </span>
            </div>
          </div>
          <p className="max-w-xs text-sm text-slate-300">{t("footer.tagline")}</p>
        </div>

        <nav aria-label={t("footer.company")}>
          <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-[#D8AE4A]">
            {t("footer.company")}
          </h2>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/about" className="text-slate-300 transition-colors hover:text-white">
                {tNav("about")}
              </Link>
            </li>
            <li>
              <Link href="/terms" className="text-slate-300 transition-colors hover:text-white">
                {tNav("terms")}
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="text-slate-300 transition-colors hover:text-white">
                {tNav("privacy")}
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label={t("footer.account")}>
          <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-[#D8AE4A]">
            {t("footer.account")}
          </h2>
          <ul className="space-y-2 text-sm">
            {user && dashboardPath ? (
              <>
                <li>
                  <Link href={dashboardPath} className="text-slate-300 transition-colors hover:text-white">
                    {dashboardLabel}
                  </Link>
                </li>
                {locale ? (
                  <li>
                    <SignOutButton
                      locale={locale}
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 text-sm font-normal text-slate-300 hover:bg-transparent hover:text-white"
                    />
                  </li>
                ) : null}
              </>
            ) : (
              <>
                <li>
                  <Link href="/login" className="text-slate-300 transition-colors hover:text-white">
                    {tNav("login")}
                  </Link>
                </li>
                <li>
                  <Link href="/register" className="text-slate-300 transition-colors hover:text-white">
                    {tNav("register")}
                  </Link>
                </li>
              </>
            )}
          </ul>
        </nav>
      </div>

      <div className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-slate-400 sm:px-6">
          © {year} Travelogy. {t("footer.rights")}
        </p>
      </div>
    </footer>
  );
}
