import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden, notFound } from "next/navigation";
import Image from "next/image";
import {
  LuChevronLeft,
  LuChevronRight,
  LuImageOff,
  LuSearch,
  LuStar,
  LuUpload,
} from "react-icons/lu";
import { isLocale } from "@/shared/i18n/config";
import { Link } from "@/shared/i18n/navigation";
import { formatDate, formatNumber } from "@/shared/lib/format";
import { cloudinaryUrl } from "@/shared/lib/media";
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
import { HOTEL_STATUSES, hotelListFiltersSchema } from "@/modules/hotels/application/schemas";
import { countHotelsByStatus, listHotels } from "@/modules/hotels/infrastructure/hotels.repository";
import { CreateHotelButton } from "@/modules/hotels/presentation/hotel-details-form";

const STATUS_TONES = { draft: "neutral", active: "success", inactive: "warning" } as const;

/**
 * Hotel list. Filters live in the URL so a filtered view is shareable and the
 * page stays a Server Component (CLAUDE.md §11).
 */
export default async function HotelsPage({
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
  if (!can(user, "hotels.view")) forbidden();

  const parsed = hotelListFiltersSchema.safeParse(await searchParams);
  const filters = parsed.success ? parsed.data : { page: 1 as const };

  const t = await getTranslations("hotels");
  const tCommon = await getTranslations("common");

  const [{ rows, total, pageSize }, counts] = await Promise.all([
    listHotels(filters),
    countHotelsByStatus(),
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
    return `/admin/hotels${qs ? `?${qs}` : ""}`;
  };

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("title")}</h1>
          <p className="max-w-prose text-sm text-ink-muted">{t("description")}</p>
        </div>
        <div className="flex items-center gap-2">
          {can(user, "hotels.rates.update") ? (
            <Link
              href="/admin/hotels/rates-upload"
              className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-3 py-2 text-sm font-medium text-ink shadow-sm hover:bg-surface-hover"
            >
              <LuUpload className="size-4" aria-hidden />
              <span>{t("uploadRates")}</span>
            </Link>
          ) : null}
          {can(user, "hotels.create") ? <CreateHotelButton locale={locale} /> : null}
        </div>
      </div>

      <Card>
        <CardBody className="space-y-4">
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
            {HOTEL_STATUSES.map((s) => (
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
                {t(`status.${s}`)} ({formatNumber(counts[s] ?? 0, locale)})
              </Link>
            ))}
          </div>

          <form method="get" className="flex flex-wrap items-end gap-2">
            {filters.status ? <input type="hidden" name="status" value={filters.status} /> : null}
            <div className="min-w-48 flex-1">
              <label htmlFor="hotel-search" className="sr-only">
                {t("filters.searchLabel")}
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-ink-subtle">
                  <LuSearch className="size-4" aria-hidden />
                </span>
                <input
                  id="hotel-search"
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
            <TableHeaderCell>{t("colHotel")}</TableHeaderCell>
            <TableHeaderCell>{t("colLocation")}</TableHeaderCell>
            <TableHeaderCell>{t("colType")}</TableHeaderCell>
            <TableHeaderCell>{t("colStatus")}</TableHeaderCell>
            <TableHeaderCell numeric>{t("colRooms")}</TableHeaderCell>
            <TableHeaderCell numeric>{t("colCreated")}</TableHeaderCell>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={6}>{t("empty")}</TableEmpty>
            ) : (
              rows.map((h) => (
                <TableRow key={h.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {h.coverUrl ? (
                        <Image
                          src={cloudinaryUrl(h.coverUrl, { width: 96, height: 64, crop: "fill" })}
                          alt=""
                          width={48}
                          height={32}
                          unoptimized
                          className="h-8 w-12 shrink-0 rounded border border-border object-cover"
                        />
                      ) : (
                        <span className="flex h-8 w-12 shrink-0 items-center justify-center rounded border border-dashed border-border-strong text-ink-subtle">
                          <LuImageOff className="size-3.5" aria-hidden />
                        </span>
                      )}
                      <div className="min-w-0">
                        <Link
                          href={`/admin/hotels/${h.id}`}
                          className="font-medium text-ink hover:text-brand-700 hover:underline"
                        >
                          {locale === "ar" ? h.nameAr : h.nameEn}
                        </Link>
                        <span className="flex items-center gap-1.5">
                          <span className="font-mono text-2xs text-ink-subtle" dir="ltr">
                            {h.code}
                          </span>
                          {h.starRating ? (
                            <span className="flex items-center gap-0.5 text-2xs text-warning-600">
                              <LuStar className="size-2.5 fill-current" aria-hidden />
                              {formatNumber(h.starRating, locale)}
                            </span>
                          ) : null}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {locale === "ar" ? h.cityAr : h.cityEn}
                    <span className="block text-2xs text-ink-subtle" dir="ltr">
                      {h.countryCode}
                    </span>
                  </TableCell>
                  <TableCell>{t(`propertyType.${h.propertyType}`)}</TableCell>
                  <TableCell>
                    <Badge tone={STATUS_TONES[h.status as keyof typeof STATUS_TONES] ?? "neutral"}>
                      {t(`status.${h.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell numeric>{formatNumber(h.roomTypeCount, locale)}</TableCell>
                  <TableCell numeric>{formatDate(h.createdAt, locale)}</TableCell>
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
