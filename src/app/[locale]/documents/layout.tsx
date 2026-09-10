import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { isLocale } from "@/shared/i18n/config";

/**
 * Documents sit outside both portal route groups on purpose (CLAUDE.md §13,
 * Phase 5c): a voucher printed with a navigation bar down the side is not a
 * voucher, and neither the agent nor the back-office chrome belongs on a page
 * that is handed to a hotel.
 *
 * `src/proxy.ts` still requires a session here — `documents` is not a public
 * segment — and RLS decides whether the caller may read the booking at all.
 */
export default async function DocumentsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  return <div className="min-h-dvh bg-canvas py-6 print:bg-white print:py-0">{children}</div>;
}
