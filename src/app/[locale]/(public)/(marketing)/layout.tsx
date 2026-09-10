import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { isLocale } from "@/shared/i18n/config";
import { SiteFooter, SiteHeader } from "@/modules/cms/presentation/site-chrome";

/**
 * Frame for the public marketing pages only.
 *
 * A nested group inside `(public)` because the auth screens are also public but
 * carry their own centred shell — putting this header on the login page would
 * fight with it.
 */
export default async function MarketingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader locale={locale} />
      <div className="flex-1">{children}</div>
      <SiteFooter locale={locale} />
    </div>
  );
}
