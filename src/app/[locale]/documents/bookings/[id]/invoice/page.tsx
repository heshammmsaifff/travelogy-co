import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Locale } from "@/shared/i18n/config";
import { getBooking } from "@/modules/bookings/infrastructure/bookings.repository";
import { getCompanyProfile } from "@/modules/finance/infrastructure/finance.repository";
import { InvoiceDocument } from "@/modules/bookings/presentation/booking-document";
import { PrintButton } from "@/modules/bookings/presentation/print-button";
import { BackToBooking } from "@/modules/bookings/presentation/document-chrome";

/** The invoice for one booking (CLAUDE.md §13, Phase 5c). */
export default async function InvoicePage({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const [booking, company] = await Promise.all([getBooking(id, locale), getCompanyProfile()]);
  // RLS returns nothing for a booking the caller may not see, so "not found"
  // and "not yours" are deliberately the same answer.
  if (!booking) notFound();

  return (
    <>
      <div
        data-print="hide"
        className="mx-auto mb-4 flex max-w-3xl items-center justify-between gap-3 px-4"
      >
        <BackToBooking bookingId={booking.id} locale={locale} />
        <PrintButton />
      </div>

      <InvoiceDocument booking={booking} company={company} locale={locale} />
    </>
  );
}
