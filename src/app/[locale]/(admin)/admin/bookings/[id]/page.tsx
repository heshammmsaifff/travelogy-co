import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden, notFound } from "next/navigation";
import { LuArrowLeft, LuArrowRight, LuFileText, LuReceipt } from "react-icons/lu";
import { LOCALE_META, type Locale } from "@/shared/i18n/config";
import { Link } from "@/shared/i18n/navigation";
import { formatDate } from "@/shared/lib/format";
import { Badge } from "@/shared/ui/badge";
import { buttonVariants } from "@/shared/ui/button-variants";
import { can } from "@/modules/auth/domain/user";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { getBooking } from "@/modules/bookings/infrastructure/bookings.repository";
import { BookingDetailView, STATUS_TONE } from "@/modules/bookings/presentation/booking-views";
import { BookingDrivers } from "@/modules/driver-ops/presentation/booking-drivers";
import { BookingControls } from "@/modules/bookings/presentation/booking-controls";

/** One booking, as the back-office sees it (CLAUDE.md §13, Phase 5a). */
export default async function AdminBookingPage({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user || !can(user, "bookings.view_all")) forbidden();

  const t = await getTranslations("bookings");
  const tDocs = await getTranslations("documents");
  const booking = await getBooking(id, locale);
  if (!booking) notFound();

  const { dir } = LOCALE_META[locale];
  const Back = dir === "rtl" ? LuArrowRight : LuArrowLeft;

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <Link
        href="/admin/bookings"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <Back className="size-4" aria-hidden />
        {t("backToList")}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="font-mono text-xs text-ink-muted" dir="ltr">
            {booking.reference}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {booking.hotelName ?? t("title")}
          </h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            <Badge tone={STATUS_TONE[booking.status]}>{t(`status.${booking.status}`)}</Badge>
            <span>
              {t("created")}: {formatDate(booking.createdAt, locale)}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* The two documents. They open outside the portal chrome so they
              print as documents rather than as a page with a navbar. */}
          <Link
            href={`/documents/bookings/${booking.id}/voucher`}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            <LuFileText aria-hidden />
            {tDocs(
              booking.productType === "transfer"
                ? "voucherTransfer"
                : booking.productType === "package"
                  ? "voucherPackage"
                  : "voucher",
            )}
          </Link>
          <Link
            href={`/documents/bookings/${booking.id}/invoice`}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            <LuReceipt aria-hidden />
            {tDocs("invoice")}
          </Link>

          {/* Which controls appear is decided by the real permission,
              resolved here. The database function re-checks it anyway (§12). */}
          <BookingControls
            bookingId={booking.id}
            status={booking.status}
            canManage={can(user, "bookings.confirm")}
            canCancel={can(user, "bookings.cancel")}
            locale={locale}
          />
        </div>
      </div>

      <BookingDetailView booking={booking} locale={locale} showAgency />

      {/* Only a transfer has drivers. Rendering the card for a hotel booking
          would ask a question the product cannot answer. */}
      {booking.productType === "transfer" ? (
        <BookingDrivers
          bookingId={booking.id}
          totalVehicles={booking.transferItems[0]?.vehicles ?? 1}
          locale={locale}
        />
      ) : null}
    </main>
  );
}
