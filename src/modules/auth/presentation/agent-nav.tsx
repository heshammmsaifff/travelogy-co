"use client";

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
import { Link, usePathname } from "@/shared/i18n/navigation";
import { cn } from "@/shared/lib/cn";

/**
 * Agent portal navigation (CLAUDE.md §13, Phase 1).
 *
 * Scoped to the sections an agency user needs to run their business. A user
 * without `agency_users.manage` will see the team tab disabled; that is
 * handled at the page rather than here so the navigation layout stays stable
 * between users.
 *
 * Everything here reads from `/agent/*` and has no access to the back-office
 * routes under `/admin/*`. Visibility across the agency's data is enforced by
 * RLS — there are no query filters here because RLS already limits rows to the
 * caller's own agency.
 */

const SECTIONS = [
  "overview",
  "search",
  "transfers",
  "packages",
  "quotations",
  "bookings",
  "statement",
  "team",
  "profile",
  "developer",
] as const;
type Section = (typeof SECTIONS)[number];

const HREF: Record<Section, string> = {
  overview: "/agent",
  search: "/agent/search",
  transfers: "/agent/transfers",
  packages: "/agent/packages",
  quotations: "/agent/quotations",
  bookings: "/agent/bookings",
  statement: "/agent/statement",
  team: "/agent/team",
  profile: "/agent/profile",
  developer: "/agent/developer",
};

/** Section icon, kept out of the SECTIONS table so that stays plain data. */
function SectionIcon({ section }: { section: Section }) {
  if (section === "overview") return <LuLayoutDashboard className="size-4 shrink-0" aria-hidden />;
  if (section === "search") return <LuSearch className="size-4 shrink-0" aria-hidden />;
  if (section === "transfers") return <LuBus className="size-4 shrink-0" aria-hidden />;
  if (section === "packages") return <LuMapPinned className="size-4 shrink-0" aria-hidden />;
  if (section === "quotations") return <LuFileText className="size-4 shrink-0" aria-hidden />;
  if (section === "bookings") return <LuCalendarClock className="size-4 shrink-0" aria-hidden />;
  if (section === "statement") return <LuReceipt className="size-4 shrink-0" aria-hidden />;
  if (section === "team") return <LuUsers className="size-4 shrink-0" aria-hidden />;
  if (section === "developer") return <LuCode className="size-4 shrink-0" aria-hidden />;
  return <LuBuilding2 className="size-4 shrink-0" aria-hidden />;
}

export function AgentNav() {
  const t = useTranslations("agent.nav");
  const pathname = usePathname();

  return (
    <nav aria-label={t("label")} className="border-b border-border bg-surface">
      {/* Scrolls horizontally on narrow screens rather than wrapping into a
          second row that pushes the page content down. */}
      <div className="mx-auto max-w-6xl overflow-x-auto px-4 sm:px-6">
        <ul className="flex min-w-max gap-1">
          {SECTIONS.map((section) => {
            const href = HREF[section];
            // "/agent" would otherwise match every child route.
            const active = href === "/agent" ? pathname === "/agent" : pathname.startsWith(href);
            return (
              <li key={section}>
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
                  <SectionIcon section={section} />
                  {t(section)}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
