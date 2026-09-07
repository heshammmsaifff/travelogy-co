import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden, notFound } from "next/navigation";
import { isLocale } from "@/shared/i18n/config";
import { formatNumber } from "@/shared/lib/format";
import { Badge } from "@/shared/ui/badge";
import { Card, CardHeader } from "@/shared/ui/card";
import {
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableShell,
} from "@/shared/ui/table";
import { can } from "@/modules/auth/domain/user";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { listRoomTypes } from "@/modules/hotels/infrastructure/hotels.repository";
import { AddRoomButton, RoomRowActions } from "@/modules/hotels/presentation/room-manager";

export default async function RoomsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!can(user, "hotels.view")) forbidden();

  const t = await getTranslations("hotels.rooms");
  const rooms = await listRoomTypes(id);
  const canManage = can(user, "hotels.rooms.manage");

  return (
    <Card>
      <CardHeader
        title={t("title")}
        description={t("description")}
        actions={canManage ? <AddRoomButton hotelId={id} /> : undefined}
      />
      <TableShell>
        <TableHead>
          <TableHeaderCell>{t("colRoom")}</TableHeaderCell>
          <TableHeaderCell numeric>{t("colOccupancy")}</TableHeaderCell>
          <TableHeaderCell numeric>{t("colTotalRooms")}</TableHeaderCell>
          <TableHeaderCell>{t("colStatus")}</TableHeaderCell>
          {canManage ? <TableHeaderCell /> : null}
        </TableHead>
        <TableBody>
          {rooms.length === 0 ? (
            <TableEmpty colSpan={canManage ? 5 : 4}>{t("empty")}</TableEmpty>
          ) : (
            rooms.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <span className="font-medium text-ink">
                    {locale === "ar" ? r.nameAr : r.nameEn}
                  </span>
                  <span className="block font-mono text-2xs text-ink-subtle" dir="ltr">
                    {r.code}
                    {r.sizeSqm ? ` · ${formatNumber(r.sizeSqm, locale)} m²` : ""}
                  </span>
                </TableCell>
                <TableCell numeric>
                  {/* The two numbers that decide pricing, shown together:
                      what the rate covers, and the hard ceiling. */}
                  <span className="text-ink tabular-nums">
                    {formatNumber(r.standardOccupancy, locale)} /{" "}
                    {formatNumber(r.maxOccupancy, locale)}
                  </span>
                  <span className="block text-2xs text-ink-subtle">
                    {t("occupancyHint", {
                      adults: formatNumber(r.maxAdults, locale),
                      children: formatNumber(r.maxChildren, locale),
                    })}
                  </span>
                </TableCell>
                <TableCell numeric>{formatNumber(r.totalRooms, locale)}</TableCell>
                <TableCell>
                  <Badge tone={r.status === "active" ? "success" : "neutral"}>
                    {t(`status.${r.status}`)}
                  </Badge>
                </TableCell>
                {canManage ? (
                  <TableCell>
                    <RoomRowActions hotelId={id} room={r} locale={locale} />
                  </TableCell>
                ) : null}
              </TableRow>
            ))
          )}
        </TableBody>
      </TableShell>
    </Card>
  );
}
