import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden, notFound } from "next/navigation";
import { isLocale } from "@/shared/i18n/config";
import { Card, CardBody, CardHeader } from "@/shared/ui/card";
import { can } from "@/modules/auth/domain/user";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { listHotelImages, listRoomTypes } from "@/modules/hotels/infrastructure/hotels.repository";
import { MediaManager } from "@/modules/hotels/presentation/media-manager";

/** Hotel photography — the first real consumer of the Phase 0 media pipeline. */
export default async function MediaPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!can(user, "hotels.view")) forbidden();

  const [images, rooms] = await Promise.all([listHotelImages(id), listRoomTypes(id)]);
  const t = await getTranslations("hotels.media");

  return (
    <Card>
      <CardHeader title={t("title")} description={t("description")} />
      <CardBody>
        <MediaManager
          hotelId={id}
          images={images}
          rooms={rooms.map((r) => ({ id: r.id, code: r.code, nameAr: r.nameAr, nameEn: r.nameEn }))}
          locale={locale}
          canManage={can(user, "hotels.media.manage")}
        />
      </CardBody>
    </Card>
  );
}
