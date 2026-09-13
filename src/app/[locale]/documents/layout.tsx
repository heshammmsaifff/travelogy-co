import { notFound, redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { isLocale } from "@/shared/i18n/config";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";

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

  // Documents sit outside the portal layouts, so they need the temporary
  // password rule stated here too — otherwise a voucher link is a way to use
  // the account before its password is private. `getCurrentUser` is cached per
  // request, so this costs nothing the page does not already pay.
  const user = await getCurrentUser();
  if (user?.mustChangePassword) redirect(`/${locale}/change-password`);

  return <div className="min-h-dvh bg-canvas py-6 print:bg-white print:py-0">{children}</div>;
}
