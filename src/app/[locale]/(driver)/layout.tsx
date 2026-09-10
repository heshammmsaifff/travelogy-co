import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/shared/i18n/config";
import { LocaleSwitcher } from "@/shared/ui/locale-switcher";
import { landingPathFor } from "@/modules/auth/domain/user";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { SignOutButton } from "@/modules/auth/presentation/sign-out-button";

/**
 * Guard and chrome for the driver portal (CLAUDE.md §13, Phase 8b).
 *
 * Deliberately thinner than the other two: no navigation bar, because there is
 * one screen. A driver opens this on a phone between jobs, and every row of
 * chrome is a row of jobs they cannot see.
 *
 * As with the other layouts this is a UI guard, not the boundary. RLS and
 * `my_driver_jobs()` are what actually stop a driver seeing someone else's
 * work — remove this check and the page renders with an empty list.
 */
export default async function DriverLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/login`);
  if (user.status !== "active") redirect(`/${locale}/pending`);
  if (user.role.scope !== "driver") redirect(`/${locale}${landingPathFor(user)}`);

  // A driver account is created with a temporary password the office has seen,
  // exactly as a staff account is (§15, 3.4), so the same rule applies.
  if (user.mustChangePassword) redirect(`/${locale}/change-password`);

  const t = await getTranslations();

  return (
    <div className="min-h-dvh bg-surface-sunken">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold tracking-tight text-ink">
              {user.fullName}
            </p>
            <p className="text-xs text-ink-muted">{t("driver.nav.label")}</p>
          </div>
          <div className="flex items-center gap-2">
            <LocaleSwitcher current={locale} label={t("common.language")} />
            <SignOutButton locale={locale} variant="ghost" />
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
