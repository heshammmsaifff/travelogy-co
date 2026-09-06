import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/shared/i18n/config";
import { Link } from "@/shared/i18n/navigation";
import { LocaleSwitcher } from "@/shared/ui/locale-switcher";
import { Badge } from "@/shared/ui/badge";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { SignOutButton } from "@/modules/auth/presentation/sign-out-button";

/**
 * Guard for the agent portal.
 *
 * The proxy has already established that a session exists; this layout makes
 * the decision that needs the profile — right scope, active account — using
 * the query it has to run anyway to render the header (CLAUDE.md §11).
 *
 * This is a UI guard, not the security boundary. RLS is what actually stops an
 * agent reading another company's rows (§12); if this check were removed, the
 * page would render but return no data.
 */
export default async function AgentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  // Next's generated route validator types this as `string`, so it cannot be
  // narrowed here. The root layout has already 404'd anything that is not a
  // configured locale, so the cast below is safe by the time we reach this.
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/login`);
  if (user.status !== "active") redirect(`/${locale}/pending`);
  // A back-office user who lands here is sent to their own side rather than
  // shown an error — it is a wrong turn, not a failure.
  if (user.role.scope !== "agent") redirect(`/${locale}/admin`);

  const t = await getTranslations();
  const roleName = locale === "ar" ? user.role.nameAr : user.role.nameEn;

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/agent" className="text-base font-semibold tracking-tight text-ink">
              {t("app.name")}
            </Link>
            {user.agency ? (
              <span className="truncate text-sm text-ink-muted">{user.agency.name}</span>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Badge tone="brand">{roleName}</Badge>
            <LocaleSwitcher current={locale} label={t("common.language")} />
            <SignOutButton locale={locale} variant="ghost" />
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
