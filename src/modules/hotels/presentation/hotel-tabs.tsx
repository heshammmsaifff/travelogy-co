"use client";

import { useTranslations } from "next-intl";
import {
  LuBedDouble,
  LuCalendarRange,
  LuImages,
  LuInfo,
  LuScrollText,
  LuTag,
  LuWallet,
} from "react-icons/lu";
import type { IconType } from "react-icons";
import { Link, usePathname } from "@/shared/i18n/navigation";
import { cn } from "@/shared/lib/cn";

/** Sub-navigation within one property. */

export type HotelTab =
  "overview" | "rooms" | "media" | "rates" | "policies" | "offers" | "allocation";

const TABS: { key: HotelTab; segment: string; icon: IconType }[] = [
  { key: "overview", segment: "", icon: LuInfo },
  { key: "rooms", segment: "/rooms", icon: LuBedDouble },
  { key: "media", segment: "/media", icon: LuImages },
  { key: "rates", segment: "/rates", icon: LuWallet },
  { key: "policies", segment: "/policies", icon: LuScrollText },
  { key: "offers", segment: "/offers", icon: LuTag },
  { key: "allocation", segment: "/allocation", icon: LuCalendarRange },
];

export function HotelTabs({ hotelId, visible }: { hotelId: string; visible: HotelTab[] }) {
  const t = useTranslations("hotels.tabs");
  const pathname = usePathname();
  const base = `/admin/hotels/${hotelId}`;

  return (
    <nav aria-label={t("label")} className="border-b border-border">
      {/* Scrolls sideways on a narrow screen rather than wrapping onto a
          second row that would push the content down. */}
      <div className="overflow-x-auto">
        <ul className="flex min-w-max gap-1">
          {TABS.filter((tab) => visible.includes(tab.key)).map(({ key, segment, icon: Icon }) => {
            const href = `${base}${segment}`;
            // The overview segment is empty, so it would prefix-match everything.
            const active = segment === "" ? pathname === base : pathname.startsWith(href);
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
