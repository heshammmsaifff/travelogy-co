import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/shared/i18n/config";
import { Link } from "@/shared/i18n/navigation";
import { buttonVariants } from "@/shared/ui/button-variants";
import { listBookings } from "@/modules/bookings/infrastructure/bookings.repository";
import { BookingList } from "@/modules/bookings/presentation/booking-views";

const STATUSES = ["all", "pending", "confirmed", "completed", "cancelled"] as const;

/**
 * The agent's booking history (CLAUDE.md §13, Phase 5a).
 *
 * The status filter lives in the URL, not component state, so a filtered view
 * is shareable and the page stays a Server Component (§15, decision 3.9).
 */
export default async function AgentBookingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { status } = await searchParams;

  const t = await getTranslations("bookings");
  const bookings = await listBookings(locale, { status });
  const active = status && STATUSES.includes(status as (typeof STATUSES)[number]) ? status : "all";

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("title")}</h1>
          <p className="text-sm text-ink-muted">{t("description")}</p>
        </div>
        <Link href="/agent/search" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          {t("searchCta")}
        </Link>
      </div>

      <nav aria-label={t("filters.label")}>
        <ul className="flex flex-wrap gap-1">
          {STATUSES.map((key) => (
            <li key={key}>
              <Link
                href={key === "all" ? "/agent/bookings" : `/agent/bookings?status=${key}`}
                aria-current={active === key ? "page" : undefined}
                className={
                  "rounded-control px-3 py-1.5 text-sm font-medium transition-colors " +
                  (active === key
                    ? "bg-brand-600 text-ink-inverse"
                    : "text-ink-muted hover:bg-surface-hover hover:text-ink")
                }
              >
                {key === "all" ? t("filters.all") : t(`status.${key}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <BookingList bookings={bookings} locale={locale} basePath="/agent/bookings" />
    </main>
  );
}
