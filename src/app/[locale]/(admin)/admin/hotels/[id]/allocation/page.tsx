import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden, notFound } from "next/navigation";
import { isLocale } from "@/shared/i18n/config";
import { Card, CardBody, CardHeader } from "@/shared/ui/card";
import { can } from "@/modules/auth/domain/user";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { listAllocations, listRoomTypes } from "@/modules/hotels/infrastructure/hotels.repository";
import { AllocationManager } from "@/modules/hotels/presentation/allocation-manager";

/** ISO date `days` from today, in UTC. */
function isoOffset(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function AllocationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ room?: string; from?: string; to?: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!can(user, "hotels.inventory.manage")) forbidden();

  const sp = await searchParams;
  const t = await getTranslations("hotels.allocation");
  const rooms = await listRoomTypes(id);

  // Default to the first room and the next 30 nights, so the page is useful
  // immediately rather than presenting an empty picker.
  const selectedRoomId =
    sp.room && rooms.some((r) => r.id === sp.room) ? sp.room : (rooms[0]?.id ?? null);

  const fromDate = sp.from && ISO_DATE.test(sp.from) ? sp.from : isoOffset(0);
  let toDate = sp.to && ISO_DATE.test(sp.to) ? sp.to : isoOffset(30);

  // A hand-edited URL must not be able to ask for an unbounded grid (§11).
  const spanDays = (Date.parse(toDate) - Date.parse(fromDate)) / 86_400_000;
  if (!Number.isFinite(spanDays) || spanDays < 0 || spanDays > 180) {
    toDate = isoOffset(30);
  }

  const cells = selectedRoomId ? await listAllocations(selectedRoomId, fromDate, toDate) : [];

  return (
    <Card>
      <CardHeader title={t("title")} description={t("description")} />
      <CardBody>
        {rooms.length === 0 ? (
          <p className="rounded-control bg-warning-50 px-3 py-2 text-sm text-warning-700">
            {t("needRoomsFirst")}
          </p>
        ) : (
          <AllocationManager
            hotelId={id}
            rooms={rooms.map((r) => ({
              id: r.id,
              code: r.code,
              nameAr: r.nameAr,
              nameEn: r.nameEn,
              totalRooms: r.totalRooms,
            }))}
            selectedRoomId={selectedRoomId}
            cells={cells}
            fromDate={fromDate}
            toDate={toDate}
            locale={locale}
            canManage={can(user, "hotels.inventory.manage")}
          />
        )}
      </CardBody>
    </Card>
  );
}
