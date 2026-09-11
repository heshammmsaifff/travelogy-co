import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden, notFound } from "next/navigation";
import { LuChevronLeft, LuChevronRight, LuSearch } from "react-icons/lu";
import { isLocale } from "@/shared/i18n/config";
import { Link } from "@/shared/i18n/navigation";
import { formatCurrency, formatDate, formatNumber } from "@/shared/lib/format";
import { cn } from "@/shared/lib/cn";
import { Badge } from "@/shared/ui/badge";
import { Card, CardBody, CardHeader } from "@/shared/ui/card";
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
import { AGENCY_STATUSES, agencyListFiltersSchema } from "@/modules/agencies/application/schemas";
import {
  countAgenciesByStatus,
  listAgencies,
} from "@/modules/agencies/infrastructure/agencies.repository";

const STATUS_TONES = {
  pending: "warning",
  active: "success",
  suspended: "danger",
  rejected: "neutral",
} as const;

/**
 * Agency list with status filter, search and pagination.
 *
 * Filters live in the URL rather than component state, so a filtered view is
 * shareable and survives a refresh — and the page stays a Server Component
 * with no client JavaScript for the list itself (CLAUDE.md §11).
 */
export default async function AgenciesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!can(user, "agencies.view")) forbidden();

  const sp = await searchParams;
  // Unparseable filters fall back to the defaults rather than 500-ing on a
  // hand-edited URL.
  const parsed = agencyListFiltersSchema.safeParse(sp);
  const filters = parsed.success ? parsed.data : { page: 1 as const };

  const t = await getTranslations("agencies");
  const tCommon = await getTranslations("common");

  const [{ rows, total, pageSize }, counts] = await Promise.all([
    listAgencies(filters),
    countAgenciesByStatus(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const Prev = locale === "ar" ? LuChevronRight : LuChevronLeft;
  const Next = locale === "ar" ? LuChevronLeft : LuChevronRight;

  const buildHref = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    if (filters.status) next.set("status", filters.status);
    if (filters.q) next.set("q", filters.q);
    if (filters.page > 1) next.set("page", String(filters.page));
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    return `/admin/agencies${qs ? `?${qs}` : ""}`;
  };

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("title")}</h1>
        <p className="max-w-prose text-sm text-ink-muted">{t("description")}</p>
      </div>

      <Card>
        <CardBody className="space-y-4">
          {/* Status filter — plain links, so it works without JavaScript. */}
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildHref({ status: undefined, page: undefined })}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                !filters.status
                  ? "border-brand-600 bg-brand-50 text-brand-700"
                  : "border-border text-ink-muted hover:bg-surface-hover",
              )}
            >
              {t("filters.all")} (
              {formatNumber(
                Object.values(counts).reduce((a, b) => a + b, 0),
                locale,
              )}
              )
            </Link>
            {AGENCY_STATUSES.map((s) => (
              <Link
                key={s}
                href={buildHref({ status: s, page: undefined })}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  filters.status === s
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : "border-border text-ink-muted hover:bg-surface-hover",
                )}
              >
                {tCommon(`status.${s}`)} ({formatNumber(counts[s] ?? 0, locale)})
              </Link>
            ))}
          </div>

          {/* GET form: the query string is the state. */}
          <form method="get" className="flex flex-wrap items-end gap-2">
            {filters.status ? <input type="hidden" name="status" value={filters.status} /> : null}
            <div className="min-w-48 flex-1">
              <label htmlFor="agency-search" className="sr-only">
                {t("filters.searchLabel")}
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-ink-subtle">
                  <LuSearch className="size-4" aria-hidden />
                </span>
                <input
                  id="agency-search"
                  name="q"
                  defaultValue={filters.q ?? ""}
                  placeholder={t("filters.searchPlaceholder")}
                  className="h-9 w-full rounded-control border border-border-strong bg-surface ps-9 pe-3 text-sm text-ink placeholder:text-ink-subtle focus-visible:outline-2 focus-visible:outline-focus"
                />
              </div>
            </div>
            <button
              type="submit"
              className="h-9 cursor-pointer rounded-control bg-brand-600 px-3.5 text-sm font-medium text-ink-inverse transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {tCommon("search")}
            </button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t("listTitle")}
          description={t("listCount", { count: formatNumber(total, locale) })}
        />
        <TableShell>
          <TableHead>
            <TableHeaderCell className="w-36 text-start">{t("colReference")}</TableHeaderCell>
            <TableHeaderCell className="min-w-[220px] text-start">{t("colName")}</TableHeaderCell>
            <TableHeaderCell className="w-28 text-center">{t("colStatus")}</TableHeaderCell>
            <TableHeaderCell numeric className="w-36">{t("colCreditLimit")}</TableHeaderCell>
            <TableHeaderCell className="w-24 text-center">{t("colUsers")}</TableHeaderCell>
            <TableHeaderCell className="w-36 text-start">{t("colCreated")}</TableHeaderCell>
            <TableHeaderCell className="w-16 text-center">
              <span className="sr-only">{tCommon("actions")}</span>
            </TableHeaderCell>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={7}>{t("empty")}</TableEmpty>
            ) : (
              rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="w-36 text-start">
                    <Link
                      href={`/admin/agencies/${a.id}`}
                      className="inline-flex items-center font-mono text-xs font-semibold text-brand-700 hover:text-brand-800 hover:underline bg-brand-50 px-2 py-0.5 rounded border border-brand-200/60"
                    >
                      <span dir="ltr">{a.code}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="min-w-[220px] text-start">
                    <div className="flex flex-col items-start gap-0.5">
                      <Link
                        href={`/admin/agencies/${a.id}`}
                        className="font-medium text-ink hover:text-brand-700 hover:underline"
                      >
                        {a.name}
                      </Link>
                      {a.email ? (
                        <span className="text-xs text-ink-muted inline-block" dir="ltr">
                          {a.email}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="w-28 text-center">
                    <Badge tone={STATUS_TONES[a.status as keyof typeof STATUS_TONES] ?? "neutral"}>
                      {tCommon(`status.${a.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell numeric className="w-36 font-medium">
                    {formatCurrency(a.creditLimit, locale, a.currencyCode)}
                  </TableCell>
                  <TableCell className="w-24 text-center">
                    <span className="inline-flex items-center justify-center size-6 rounded-full bg-surface-sunken border border-border text-xs font-semibold text-ink">
                      {formatNumber(a.userCount, locale)}
                    </span>
                  </TableCell>
                  <TableCell className="w-36 text-start text-xs text-ink-muted whitespace-nowrap">
                    {formatDate(a.createdAt, locale)}
                  </TableCell>
                  <TableCell className="w-16 text-center">
                    <div className="flex justify-center">
                      <Link
                        href={`/admin/agencies/${a.id}`}
                        aria-label={tCommon("view")}
                        className="rounded-control p-1.5 text-ink-subtle hover:bg-brand-50 hover:text-brand-700 transition-colors"
                      >
                        <Next className="size-4" aria-hidden />
                      </Link>
                    </div>
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
                page: formatNumber(filters.page, locale),
                total: formatNumber(totalPages, locale),
              })}
            </p>
            <div className="flex gap-1">
              {filters.page > 1 ? (
                <Link
                  href={buildHref({ page: String(filters.page - 1) })}
                  aria-label={tCommon("previous")}
                  className="rounded-control border border-border p-1.5 text-ink-muted hover:bg-surface-hover hover:text-ink"
                >
                  <Prev className="size-4" aria-hidden />
                </Link>
              ) : null}
              {filters.page < totalPages ? (
                <Link
                  href={buildHref({ page: String(filters.page + 1) })}
                  aria-label={tCommon("next")}
                  className="rounded-control border border-border p-1.5 text-ink-muted hover:bg-surface-hover hover:text-ink"
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
