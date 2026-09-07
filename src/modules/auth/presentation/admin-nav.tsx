"use client";

import { useTranslations } from "next-intl";
import {
  LuBuilding2,
  LuHotel,
  LuLayoutDashboard,
  LuScrollText,
  LuSettings,
  LuShieldCheck,
  LuUsers,
} from "react-icons/lu";
import type { IconType } from "react-icons";
import { Link, usePathname } from "@/shared/i18n/navigation";
import { cn } from "@/shared/lib/cn";

/**
 * Back-office navigation.
 *
 * Only renders the sections the signed-in user actually holds a permission
 * for — the caller resolves those server-side and passes them in, so this
 * component never sees the permission list itself. Hiding a link is a
 * convenience, not a control: the page behind it re-checks (CLAUDE.md §12).
 */

export type AdminSection =
  "overview" | "hotels" | "agencies" | "staff" | "roles" | "settings" | "audit";

const SECTIONS: { key: AdminSection; href: string; icon: IconType }[] = [
  { key: "overview", href: "/admin", icon: LuLayoutDashboard },
  { key: "hotels", href: "/admin/hotels", icon: LuHotel },
  { key: "agencies", href: "/admin/agencies", icon: LuBuilding2 },
  { key: "staff", href: "/admin/staff", icon: LuUsers },
  { key: "roles", href: "/admin/roles", icon: LuShieldCheck },
  { key: "settings", href: "/admin/settings", icon: LuSettings },
  { key: "audit", href: "/admin/audit", icon: LuScrollText },
];

export function AdminNav({ visible }: { visible: AdminSection[] }) {
  const t = useTranslations("admin.nav");
  const pathname = usePathname();

  const items = SECTIONS.filter((s) => visible.includes(s.key));

  return (
    <nav aria-label={t("label")} className="border-b border-border bg-surface">
      {/* Scrolls horizontally on narrow screens rather than wrapping into a
          second row that pushes the page content down. */}
      <div className="mx-auto max-w-6xl overflow-x-auto px-4 sm:px-6">
        <ul className="flex min-w-max gap-1">
          {items.map(({ key, href, icon: Icon }) => {
            // "/admin" would otherwise match every child route.
            const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
            return (
              <li key={key}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus",
                    active
                      ? "border-brand-600 text-brand-700"
                      : "border-transparent text-ink-muted hover:border-border-strong hover:text-ink",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {t(key)}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
