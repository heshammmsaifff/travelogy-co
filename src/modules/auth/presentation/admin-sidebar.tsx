"use client";

import * as React from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  LuBuilding2,
  LuCalendarClock,
  LuChartNoAxesColumn,
  LuNewspaper,
  LuWallet,
  LuHotel,
  LuLayoutDashboard,
  LuScrollText,
  LuSettings,
  LuShieldCheck,
  LuUsers,
  LuBus,
  LuIdCard,
  LuClipboardList,
  LuMapPinned,
  LuHandshake,
} from "react-icons/lu";
import type { IconType } from "react-icons";
import type { Locale } from "@/shared/i18n/config";
import { Link, usePathname } from "@/shared/i18n/navigation";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  useSidebar,
} from "@/shared/ui/sidebar";
import { Badge } from "@/shared/ui/badge";
import type { AdminSection } from "@/modules/auth/presentation/admin-nav";
import { cn } from "@/shared/lib/cn";

type NavDef = {
  key: AdminSection;
  href: string;
  icon: IconType;
};

const OPERATIONS_SECTIONS: NavDef[] = [
  { key: "overview", href: "/admin", icon: LuLayoutDashboard },
  { key: "bookings", href: "/admin/bookings", icon: LuCalendarClock },
  { key: "hotels", href: "/admin/hotels", icon: LuHotel },
  { key: "transfers", href: "/admin/transfers", icon: LuBus },
  { key: "packages", href: "/admin/packages", icon: LuMapPinned },
  { key: "dispatch", href: "/admin/dispatch", icon: LuClipboardList },
  { key: "drivers", href: "/admin/drivers", icon: LuIdCard },
];

const PARTNER_SECTIONS: NavDef[] = [
  { key: "agencies", href: "/admin/agencies", icon: LuBuilding2 },
  { key: "crm", href: "/admin/crm", icon: LuHandshake },
  { key: "finance", href: "/admin/finance", icon: LuWallet },
];

const SYSTEM_SECTIONS: NavDef[] = [
  { key: "content", href: "/admin/content", icon: LuNewspaper },
  { key: "staff", href: "/admin/staff", icon: LuUsers },
  { key: "roles", href: "/admin/roles", icon: LuShieldCheck },
  { key: "reports", href: "/admin/reports", icon: LuChartNoAxesColumn },
  { key: "settings", href: "/admin/settings", icon: LuSettings },
  { key: "audit", href: "/admin/audit", icon: LuScrollText },
];

interface AdminSidebarProps {
  visible: AdminSection[];
  locale: Locale;
  user: {
    fullName: string;
    role: {
      key: string;
      nameAr: string;
      nameEn: string;
    };
  };
}

export function AdminSidebar({ visible, locale, user }: AdminSidebarProps) {
  const t = useTranslations("admin.nav");
  const tAdmin = useTranslations("admin");
  const pathname = usePathname();
  const { isCollapsed } = useSidebar();

  const side = locale === "ar" ? "right" : "left";
  const roleName = locale === "ar" ? user.role.nameAr : user.role.nameEn;

  const renderGroup = (label: string, items: NavDef[]) => {
    const permittedItems = items.filter((item) => visible.includes(item.key));
    if (permittedItems.length === 0) return null;

    return (
      <SidebarGroup>
        <SidebarGroupLabel>{label}</SidebarGroupLabel>
        <SidebarMenu>
          {permittedItems.map(({ key, href, icon: Icon }) => {
            const isActive =
              href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

            return (
              <SidebarMenuItem key={key}>
                <Link href={href} className="block w-full">
                  <SidebarMenuButton
                    isActive={isActive}
                    tooltip={t(key)}
                    className={cn(
                      "relative justify-start gap-3 px-3 py-2 text-sm font-medium",
                      "group-data-[state=collapsed]/sidebar:justify-center group-data-[state=collapsed]/sidebar:px-0",
                      isActive
                        ? "bg-[#063B4A] text-white shadow-xs"
                        : "text-ink-muted hover:bg-neutral-100 hover:text-ink",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-4 shrink-0 transition-colors",
                        isActive ? "text-[#D8AE4A]" : "text-brand-500",
                      )}
                      aria-hidden
                    />
                    <span className="truncate group-data-[state=collapsed]/sidebar:hidden">{t(key)}</span>
                    {isActive ? (
                      <span
                        className="absolute end-1.5 top-2.5 bottom-2.5 w-1 rounded-full bg-[#D8AE4A] group-data-[state=collapsed]/sidebar:hidden"
                        aria-hidden
                      />
                    ) : null}
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroup>
    );
  };

  return (
    <Sidebar side={side} collapsible="icon" className="border-border/80">
      {/* ── Brand Header ───────────────────────────────────────────────── */}
      <SidebarHeader>
        <Link
          href="/admin"
          className="flex items-center gap-3 px-1 py-1 group transition-opacity hover:opacity-95 group-data-[state=collapsed]/sidebar:justify-center"
          title={isCollapsed ? `Travelogy — ${tAdmin("backOffice")}` : undefined}
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#063B4A] p-1.5 shadow-sm border border-[#D8AE4A]/30">
            <Image
              src="/logo.png"
              alt="Travelogy"
              width={32}
              height={22}
              className="h-5 w-auto object-contain brightness-110"
              priority
            />
          </div>
          <div className="flex flex-col min-w-0 group-data-[state=collapsed]/sidebar:hidden">
            <span className="text-base font-bold tracking-tight text-ink leading-tight font-sans">
              Travelogy
            </span>
            <span className="text-[9px] tracking-wider text-brand-600 font-semibold uppercase">
              {tAdmin("backOffice")}
            </span>
          </div>
        </Link>
      </SidebarHeader>

      {/* ── Navigation Sections ────────────────────────────────────────── */}
      <SidebarContent>
        {renderGroup(t("groupOperations"), OPERATIONS_SECTIONS)}
        {renderGroup(t("groupPartners"), PARTNER_SECTIONS)}
        {renderGroup(t("groupSystem"), SYSTEM_SECTIONS)}
      </SidebarContent>

      {/* ── User Footer ─────────────────────────────────────────────────── */}
      <SidebarFooter>
        {isCollapsed ? (
          <div className="flex items-center justify-center py-1">
            <div
              className="flex size-8 items-center justify-center rounded-full bg-brand-50 border border-brand-200 text-xs font-bold text-brand-700 shadow-2xs"
              title={`${user.fullName} (${roleName})`}
            >
              {user.fullName.trim()[0]}
            </div>
          </div>
        ) : (
          <div className="rounded-control bg-neutral-100/70 border border-border/80 p-2.5 flex items-center justify-between gap-2 min-w-0">
            <span className="truncate text-xs font-semibold text-ink">
              {user.fullName}
            </span>
            <Badge tone={user.role.key === "super_admin" ? "gold" : "navy"} className="text-[10px] px-1.5 py-0 shrink-0">
              {roleName}
            </Badge>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
