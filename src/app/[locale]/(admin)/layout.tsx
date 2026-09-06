import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/shared/i18n/config";
import { Link } from "@/shared/i18n/navigation";
import { LocaleSwitcher } from "@/shared/ui/locale-switcher";
import { Badge } from "@/shared/ui/badge";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { SignOutButton } from "@/modules/auth/presentation/sign-out-button";

/**
 * Guard for the back-office. Mirror image of the agent layout.
 *
 * Note it checks role *scope*, not a role key: with custom roles (§7) there is
 * no fixed list of back-office role names to compare against, and hardcoding
 * one would exclude every role the super_admin creates.
 */
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  // Typed `string` because Next's generated route validator requires it; the
  // root layout has already rejected any locale outside the configured set.
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/login`);
  if (user.status !== "active") redirect(`/${locale}/pending`);
  if (user.role.scope !== "admin") redirect(`/${locale}/agent`);

  const t = await getTranslations();
  const roleName = locale === "ar" ? user.role.nameAr : user.role.nameEn;

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/admin" className="text-base font-semibold tracking-tight text-ink">
              {t("app.name")}
            </Link>
            <span className="text-sm text-ink-muted">{t("admin.backOffice")}</span>
          </div>

          <div className="flex items-center gap-2">
            <Badge tone={user.role.key === "super_admin" ? "danger" : "brand"}>{roleName}</Badge>
            <LocaleSwitcher current={locale} label={t("common.language")} />
            <SignOutButton locale={locale} variant="ghost" />
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
