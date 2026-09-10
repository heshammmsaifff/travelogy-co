import { getTranslations } from "next-intl/server";
import { LuCar, LuPhone } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { formatNumber } from "@/shared/lib/format";
import { Badge } from "@/shared/ui/badge";
import { Card, CardBody, CardHeader } from "@/shared/ui/card";
import { getBookingDrivers } from "@/modules/driver-ops/infrastructure/drivers.repository";

const TONE = {
  assigned: "neutral",
  en_route: "brand",
  arrived: "warning",
  picked_up: "brand",
  completed: "success",
  no_show: "danger",
  cancelled: "danger",
} as const;

/**
 * "Who is driving", on a transfer booking (CLAUDE.md §13, Phase 8b).
 *
 * The agent's customer asks this, so the agent needs an answer — but the row
 * behind it carries a licence number and that driver's other jobs, and RLS
 * grants rows rather than columns (§15, Phase 1). So this reads a function
 * that returns three fields and nothing else, and renders nothing at all until
 * dispatch has assigned somebody rather than showing an empty promise.
 */
export async function BookingDrivers({
  bookingId,
  totalVehicles,
  locale,
}: {
  bookingId: string;
  /**
   * How many vehicles the BOOKING has — not how many have a driver. Counting
   * the contacts would label the first of three cars "car 1 of 1" as soon as
   * only one had been assigned, which is worse than no label.
   */
  totalVehicles: number;
  locale: Locale;
}) {
  const contacts = await getBookingDrivers(bookingId);
  if (contacts.length === 0) return null;

  const t = await getTranslations("drivers");
  const tDriver = await getTranslations("driver");

  return (
    <Card>
      <CardHeader title={t("title")} />
      <CardBody className="p-0">
        <ul className="divide-y divide-border">
          {contacts.map((c) => (
            <li
              key={c.vehicleSeq}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
            >
              <div className="min-w-0 space-y-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                  <LuCar className="size-4 shrink-0 text-ink-subtle" aria-hidden />
                  {c.driverName}
                  <Badge tone={TONE[c.status]}>{tDriver(`status.${c.status}`)}</Badge>
                </p>
                {totalVehicles > 1 ? (
                  <p className="text-xs text-ink-muted">
                    {t("vehicleLabel", {
                      seq: formatNumber(c.vehicleSeq, locale),
                      total: formatNumber(totalVehicles, locale),
                    })}
                  </p>
                ) : null}
              </div>

              <a
                href={`tel:${c.driverPhone}`}
                className="flex items-center gap-1.5 text-sm text-brand-700 hover:underline"
                dir="ltr"
              >
                <LuPhone className="size-3.5" aria-hidden />
                {c.driverPhone}
              </a>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
