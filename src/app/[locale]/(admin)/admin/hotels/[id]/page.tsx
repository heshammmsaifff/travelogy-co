import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden, notFound } from "next/navigation";
import { isLocale } from "@/shared/i18n/config";
import { Card, CardBody, CardHeader } from "@/shared/ui/card";
import { can } from "@/modules/auth/domain/user";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { getHotel, listAmenities } from "@/modules/hotels/infrastructure/hotels.repository";
import { AmenitiesForm, HotelDetailsForm } from "@/modules/hotels/presentation/hotel-details-form";

/** Property overview: the descriptive record and its amenities. */
export default async function HotelOverviewPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!can(user, "hotels.view")) forbidden();

  const [hotel, amenities] = await Promise.all([getHotel(id), listAmenities()]);
  if (!hotel) notFound();

  const t = await getTranslations("hotels");
  const canEdit = can(user, "hotels.update");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title={t("details.title")} description={t("details.description")} />
        <CardBody>
          {canEdit ? (
            <HotelDetailsForm hotel={hotel} />
          ) : (
            <p className="text-sm text-ink-muted">{t("details.readOnly")}</p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("amenities.title")} description={t("amenities.description")} />
        <CardBody>
          {canEdit ? (
            <AmenitiesForm
              hotelId={hotel.id}
              groups={[...amenities.entries()]}
              selected={hotel.amenityKeys}
              locale={locale}
            />
          ) : (
            <p className="text-sm text-ink-muted">{t("details.readOnly")}</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
