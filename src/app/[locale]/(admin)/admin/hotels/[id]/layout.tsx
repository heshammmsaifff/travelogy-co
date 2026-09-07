import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden, notFound } from "next/navigation";
import { isLocale } from "@/shared/i18n/config";
import { Link } from "@/shared/i18n/navigation";
import { Badge } from "@/shared/ui/badge";
import { can } from "@/modules/auth/domain/user";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { getHotel } from "@/modules/hotels/infrastructure/hotels.repository";
import { HotelStatusControls } from "@/modules/hotels/presentation/hotel-details-form";
import { HotelTabs, type HotelTab } from "@/modules/hotels/presentation/hotel-tabs";

const STATUS_TONES = { draft: "neutral", active: "success", inactive: "warning" } as const;

/**
 * Shell for one property: header, status control and the sub-navigation.
 *
 * Loading the hotel here means the child pages get it from the same
 * request-scoped cache rather than each running their own query.
 */
export default async function HotelLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: rawLocale, id } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale = rawLocale;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!can(user, "hotels.view")) forbidden();

  const hotel = await getHotel(id);
  if (!hotel) notFound();

  const t = await getTranslations("hotels");

  // Rates are commercially sensitive, so that tab is gated separately from the
  // rest of the property (a content editor may maintain photos without seeing
  // contracted prices).
  const tabs: HotelTab[] = ["overview", "rooms", "media"];
  if (can(user, "hotels.rates.view")) tabs.push("rates", "policies");
  if (can(user, "hotels.offers.manage")) tabs.push("offers");
  if (can(user, "hotels.inventory.manage")) tabs.push("allocation");

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-3">
        <Link
          href="/admin/hotels"
          className="text-sm text-ink-muted hover:text-ink hover:underline"
        >
          {t("backToList")}
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-ink">
                {locale === "ar" ? hotel.nameAr : hotel.nameEn}
              </h1>
              <Badge tone={STATUS_TONES[hotel.status as keyof typeof STATUS_TONES] ?? "neutral"}>
                {t(`status.${hotel.status}`)}
              </Badge>
            </div>
            <p className="text-sm text-ink-muted">
              <span className="font-mono text-xs" dir="ltr">
                {hotel.code}
              </span>
              {" · "}
              {locale === "ar" ? hotel.cityAr : hotel.cityEn}
            </p>
          </div>

          {can(user, "hotels.publish") ? (
            <HotelStatusControls hotelId={hotel.id} status={hotel.status} locale={locale} />
          ) : null}
        </div>
      </div>

      <HotelTabs hotelId={hotel.id} visible={tabs} />

      {children}
    </main>
  );
}
