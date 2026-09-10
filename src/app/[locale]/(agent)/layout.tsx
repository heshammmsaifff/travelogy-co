import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/shared/i18n/config";
import { LocaleSwitcher } from "@/shared/ui/locale-switcher";
import { Badge } from "@/shared/ui/badge";
import { landingPathFor } from "@/modules/auth/domain/user";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { SignOutButton } from "@/modules/auth/presentation/sign-out-button";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/shared/ui/sidebar";
import { AgentSidebar } from "@/modules/auth/presentation/agent-sidebar";

/**
 * Guard for the agent portal with Shadcn UI Sidebar.
 */
export default async function AgentLayout({
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
  if (user.role.scope !== "agent") redirect(`/${locale}${landingPathFor(user)}`);

  const t = await getTranslations();
  const roleName = locale === "ar" ? user.role.nameAr : user.role.nameEn;

  const userSummary = {
    fullName: user.fullName,
    role: {
      nameAr: user.role.nameAr,
      nameEn: user.role.nameEn,
    },
    agency: user.agency
      ? {
          id: user.agency.id,
          name: user.agency.name,
        }
      : null,
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-dvh w-full bg-canvas">
        <AgentSidebar locale={locale} user={userSummary} />
        <SidebarInset className="flex min-w-0 flex-1 flex-col">
          {/* Top Sticky Header */}
          <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface/95 px-4 backdrop-blur sm:px-6">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <span className="h-4 w-px bg-border hidden sm:inline-block" aria-hidden />
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tracking-tight text-ink">
                  {t("agent.nav.label")}
                </span>
                {user.agency ? (
                  <span className="truncate text-xs font-semibold text-brand-600 bg-brand-50 border border-brand-100 px-2 py-0.5 rounded-full hidden sm:inline-block">
                    {user.agency.name}
                  </span>
                ) : null}
                <Badge tone="brand" className="hidden sm:inline-flex">
                  {roleName}
                </Badge>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <LocaleSwitcher current={locale} label={t("common.language")} />
              <SignOutButton locale={locale} variant="ghost" size="sm" />
            </div>
          </header>

          <div className="flex-1">
            {children}
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
