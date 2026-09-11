import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden, notFound } from "next/navigation";
import {
  LuChevronLeft,
  LuChevronRight,
  LuSearch,
  LuUser,
} from "react-icons/lu";
import { isLocale, type Locale } from "@/shared/i18n/config";
import { Link } from "@/shared/i18n/navigation";
import { formatNumber } from "@/shared/lib/format";
import { cn } from "@/shared/lib/cn";
import { Badge } from "@/shared/ui/badge";
import { Card, CardHeader } from "@/shared/ui/card";
import {
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableShell,
} from "@/shared/ui/table";
import { can } from "@/modules/auth/domain/user";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { listAuditLog } from "@/modules/auth/infrastructure/access.repository";
import {
  AuditActionBadge,
  AuditRowDetails,
} from "@/modules/auth/presentation/audit-presenter";

const PAGE_SIZE = 40;

/**
 * Audit trail (CLAUDE.md §7 rule 4).
 *
 * Upgraded with human-friendly bilingual formatting, action badges,
 * visual state transitions, category tabs, and search.
 */
export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; type?: string; q?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!can(user, "audit.view")) forbidden();

  const { page: pageParam, type: typeParam, q: qParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const currentType = typeParam || "all";
  const search = qParam?.trim() || "";

  const t = await getTranslations("audit");
  const { rows, total } = await listAuditLog(
    PAGE_SIZE,
    (page - 1) * PAGE_SIZE,
    { entityType: currentType, search },
  );
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const Prev = locale === "ar" ? LuChevronRight : LuChevronLeft;
  const Next = locale === "ar" ? LuChevronLeft : LuChevronRight;

  const stamp = new Intl.DateTimeFormat(
    locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB",
    {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Cairo",
    },
  );

  const filterTabs = [
    { key: "all", label: t("filterAll") },
    { key: "profile", label: t("filterUsers") },
    { key: "agency", label: t("filterAgencies") },
    { key: "role", label: t("filterRoles") },
  ];

  const buildQuery = (targetPage: number) => {
    const params = new URLSearchParams();
    if (targetPage > 1) params.set("page", String(targetPage));
    if (currentType !== "all") params.set("type", currentType);
    if (search) params.set("q", search);
    const qs = params.toString();
    return `/admin/audit${qs ? `?${qs}` : ""}`;
  };

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-ink font-sans">
          {t("title")}
        </h1>
        <p className="max-w-3xl text-sm text-ink-muted leading-relaxed">
          {t("description")}
        </p>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface p-1 shadow-2xs">
          {filterTabs.map((tab) => {
            const isActive = currentType === tab.key;
            const tabParams = new URLSearchParams();
            if (tab.key !== "all") tabParams.set("type", tab.key);
            if (search) tabParams.set("q", search);
            const tabQs = tabParams.toString();
            const tabHref = `/admin/audit${tabQs ? `?${tabQs}` : ""}`;

            return (
              <Link
                key={tab.key}
                href={tabHref}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                  isActive
                    ? "bg-[#063B4A] text-white shadow-xs"
                    : "text-ink-muted hover:bg-surface-hover hover:text-ink",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        <form method="GET" className="relative w-full sm:w-72">
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder={t("searchPlaceholder")}
            className="h-9 w-full rounded-control border border-border bg-surface ps-8 pe-3 text-xs text-ink placeholder:text-ink-subtle focus-visible:outline-2 focus-visible:outline-focus shadow-2xs"
          />
          {currentType !== "all" ? (
            <input type="hidden" name="type" value={currentType} />
          ) : null}
          <span
            className="pointer-events-none absolute inset-y-0 start-2.5 flex items-center text-ink-subtle"
            aria-hidden
          >
            <LuSearch className="size-3.5" />
          </span>
        </form>
      </div>

      <Card className="shadow-xs border-border/80">
        <CardHeader
          title={t("listTitle")}
          description={t("listCount", {
            count: formatNumber(total, locale as Locale),
          })}
        />
        <TableShell>
          <TableHead>
            <TableHeaderCell className="w-44">{t("colWhen")}</TableHeaderCell>
            <TableHeaderCell className="w-48">{t("colActor")}</TableHeaderCell>
            <TableHeaderCell className="w-52">{t("colAction")}</TableHeaderCell>
            <TableHeaderCell>{t("colDetails")}</TableHeaderCell>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={4}>{t("empty")}</TableEmpty>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id} className="hover:bg-canvas/50 transition-colors">
                  {/* When */}
                  <TableCell className="text-xs whitespace-nowrap text-ink-muted font-medium" dir="ltr">
                    {stamp.format(new Date(r.createdAt))}
                  </TableCell>

                  {/* Actor */}
                  <TableCell>
                    {r.actorEmail ? (
                      <div className="flex items-center gap-2">
                        <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#063B4A]/10 text-[#063B4A] text-2xs font-bold uppercase">
                          {r.actorEmail[0]}
                        </div>
                        <span className="text-xs font-medium text-ink truncate max-w-[140px]" dir="ltr" title={r.actorEmail}>
                          {r.actorEmail}
                        </span>
                      </div>
                    ) : (
                      <Badge tone="neutral" className="gap-1">
                        <LuUser className="size-3 text-ink-subtle" />
                        <span>{t("systemActor")}</span>
                      </Badge>
                    )}
                  </TableCell>

                  {/* Action with Icon */}
                  <TableCell>
                    <AuditActionBadge
                      action={r.action}
                      locale={locale as Locale}
                    />
                  </TableCell>

                  {/* Human readable Details + collapsible JSON */}
                  <TableCell>
                    <AuditRowDetails
                      action={r.action}
                      changes={r.changes}
                      locale={locale as Locale}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </TableShell>

        {totalPages > 1 ? (
          <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
            <p className="text-xs text-ink-muted">
              {t("pageOf", {
                page: formatNumber(page, locale as Locale),
                total: formatNumber(totalPages, locale as Locale),
              })}
            </p>
            <div className="flex gap-1">
              {page > 1 ? (
                <Link
                  href={buildQuery(page - 1)}
                  className="rounded-control border border-border p-1.5 text-ink-muted hover:bg-surface-hover hover:text-ink transition-colors"
                >
                  <Prev className="size-4" aria-hidden />
                </Link>
              ) : null}
              {page < totalPages ? (
                <Link
                  href={buildQuery(page + 1)}
                  className="rounded-control border border-border p-1.5 text-ink-muted hover:bg-surface-hover hover:text-ink transition-colors"
                >
                  <Next className="size-4" aria-hidden />
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </Card>
    </main>
  );
}
