import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/shared/i18n/config";
import { LocaleSwitcher } from "@/shared/ui/locale-switcher";
import { Badge } from "@/shared/ui/badge";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { can, landingPathFor } from "@/modules/auth/domain/user";
import type { AdminSection } from "@/modules/auth/presentation/admin-nav";
import { SignOutButton } from "@/modules/auth/presentation/sign-out-button";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/shared/ui/sidebar";
import { AdminSidebar } from "@/modules/auth/presentation/admin-sidebar";

/**
 * Guard for the back-office with Shadcn UI Sidebar.
 */
export default async function AdminLayout({
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
  if (user.role.scope !== "admin") redirect(`/${locale}${landingPathFor(user)}`);
  if (user.mustChangePassword) redirect(`/${locale}/change-password`);

  const t = await getTranslations();
  const roleName = locale === "ar" ? user.role.nameAr : user.role.nameEn;

  // Navigation is built from what this user may actually do
  const sections: AdminSection[] = ["overview"];
  if (can(user, "bookings.view_all")) sections.push("bookings");
  if (can(user, "hotels.view")) sections.push("hotels");
  if (can(user, "transfers.manage")) sections.push("transfers");
  if (can(user, "packages.manage")) sections.push("packages");
  if (can(user, "dispatch.manage")) sections.push("dispatch");
  if (can(user, "drivers.manage")) sections.push("drivers");
  if (can(user, "finance.statements.view")) sections.push("finance");
  if (can(user, "agencies.view")) sections.push("agencies");
  if (can(user, "crm.view") || can(user, "crm.manage")) sections.push("crm");
  if (can(user, "cms.content.publish")) sections.push("content");
  if (can(user, "staff.view")) sections.push("staff");
  if (can(user, "settings.roles.manage")) sections.push("roles");
  if (
    can(user, "settings.suppliers.manage") ||
    can(user, "settings.markup.manage") ||
    can(user, "finance.settings.manage")
  )
    sections.push("settings");
  if (can(user, "reports.view")) sections.push("reports");
  if (can(user, "audit.view")) sections.push("audit");

  const userSummary = {
    fullName: user.fullName,
    role: {
      key: user.role.key,
      nameAr: user.role.nameAr,
      nameEn: user.role.nameEn,
    },
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-dvh w-full bg-canvas">
        <AdminSidebar visible={sections} locale={locale} user={userSummary} />
        <SidebarInset className="flex min-w-0 flex-1 flex-col">
          {/* Top Sticky Header */}
          <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface/95 px-4 backdrop-blur sm:px-6">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <span className="h-4 w-px bg-border hidden sm:inline-block" aria-hidden />
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tracking-tight text-ink">
                  {t("admin.backOffice")}
                </span>
                <Badge tone={user.role.key === "super_admin" ? "gold" : "navy"} className="hidden sm:inline-flex">
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
