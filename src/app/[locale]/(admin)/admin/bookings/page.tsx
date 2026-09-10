import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden } from "next/navigation";
import type { Locale } from "@/shared/i18n/config";
import { Link } from "@/shared/i18n/navigation";
import { can } from "@/modules/auth/domain/user";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { listBookings } from "@/modules/bookings/infrastructure/bookings.repository";
import { BookingList } from "@/modules/bookings/presentation/booking-views";

const STATUSES = ["all", "pending", "confirmed", "completed", "cancelled"] as const;

/**
 * Back-office booking list (CLAUDE.md §13, Phase 5a).
 *
 * `forbidden()` rather than a 404 for a staff member without the permission,
 * so they can tell "I need access" from "I mistyped" (§15, decision 3.7).
 */
export default async function AdminBookingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { status } = await searchParams;

  const user = await getCurrentUser();
  if (!user || !can(user, "bookings.view_all")) forbidden();

  const t = await getTranslations("bookings");
  const bookings = await listBookings(locale, { status });
  const active = status && STATUSES.includes(status as (typeof STATUSES)[number]) ? status : "all";

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("adminTitle")}</h1>
        <p className="text-sm text-ink-muted">{t("adminDescription")}</p>
      </div>

      <nav aria-label={t("filters.label")}>
        <ul className="flex flex-wrap gap-1">
          {STATUSES.map((key) => (
            <li key={key}>
              <Link
                href={key === "all" ? "/admin/bookings" : `/admin/bookings?status=${key}`}
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

      <BookingList bookings={bookings} locale={locale} basePath="/admin/bookings" showAgency />
    </main>
  );
}
