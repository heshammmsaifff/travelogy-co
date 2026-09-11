"use client";

import * as React from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  LuBuilding2,
  LuCalendarClock,
  LuFileText,
  LuLayoutDashboard,
  LuReceipt,
  LuSearch,
  LuBus,
  LuMapPinned,
  LuUsers,
  LuCode,
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
import { cn } from "@/shared/lib/cn";

type NavDef = {
  key: string;
  href: string;
  icon: IconType;
};

const BOOKINGS_SECTIONS: NavDef[] = [
  { key: "overview", href: "/agent", icon: LuLayoutDashboard },
  { key: "search", href: "/agent/search", icon: LuSearch },
  { key: "bookings", href: "/agent/bookings", icon: LuCalendarClock },
  { key: "quotations", href: "/agent/quotations", icon: LuFileText },
];

const SERVICES_SECTIONS: NavDef[] = [
  { key: "transfers", href: "/agent/transfers", icon: LuBus },
  { key: "packages", href: "/agent/packages", icon: LuMapPinned },
];

const ACCOUNT_SECTIONS: NavDef[] = [
  { key: "statement", href: "/agent/statement", icon: LuReceipt },
  { key: "team", href: "/agent/team", icon: LuUsers },
  { key: "profile", href: "/agent/profile", icon: LuBuilding2 },
  { key: "developer", href: "/agent/developer", icon: LuCode },
];

interface AgentSidebarProps {
  locale: Locale;
  user: {
    fullName: string;
    role: {
      nameAr: string;
      nameEn: string;
    };
    agency: {
      id: string;
      name: string;
    } | null;
  };
}

export function AgentSidebar({ locale, user }: AgentSidebarProps) {
  const t = useTranslations("agent.nav");
  const pathname = usePathname();
  const { isCollapsed } = useSidebar();

  const side = locale === "ar" ? "right" : "left";
  const roleName = locale === "ar" ? user.role.nameAr : user.role.nameEn;

  const renderGroup = (label: string, items: NavDef[]) => {
    return (
      <SidebarGroup>
        <SidebarGroupLabel>{label}</SidebarGroupLabel>
        <SidebarMenu>
          {items.map(({ key, href, icon: Icon }) => {
            const isActive =
              href === "/agent" ? pathname === "/agent" : pathname.startsWith(href);

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
          href="/agent"
          className="flex items-center gap-3 px-1 py-1 group transition-opacity hover:opacity-95 group-data-[state=collapsed]/sidebar:justify-center"
          title={isCollapsed ? `Travelogy — ${t("label")}` : undefined}
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
              {t("label")}
            </span>
          </div>
        </Link>

        {user.agency ? (
          <div className="mt-1 rounded-lg bg-brand-50/70 border border-brand-100 px-2.5 py-1.5 flex items-center gap-2 group-data-[state=collapsed]/sidebar:hidden">
            <LuBuilding2 className="size-3.5 text-brand-600 shrink-0" />
            <span className="truncate text-xs font-semibold text-brand-700">
              {user.agency.name}
            </span>
          </div>
        ) : null}
      </SidebarHeader>

      {/* ── Navigation Sections ────────────────────────────────────────── */}
      <SidebarContent>
        {renderGroup(t("groupBookings"), BOOKINGS_SECTIONS)}
        {renderGroup(t("groupServices"), SERVICES_SECTIONS)}
        {renderGroup(t("groupAccount"), ACCOUNT_SECTIONS)}
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
            <Badge tone="brand" className="text-[10px] px-1.5 py-0 shrink-0">
              {roleName}
            </Badge>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
