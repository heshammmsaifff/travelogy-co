"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { LuPlane, LuUserMinus, LuUsers } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { useRouter } from "@/shared/i18n/navigation";
import { formatNumber } from "@/shared/lib/format";
import { toast } from "@/shared/lib/toast";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardBody } from "@/shared/ui/card";
import type { DispatchRow } from "@/modules/driver-ops/infrastructure/drivers.repository";
import { assignDriverAction, unassignDriverAction, type Result } from "./driver-actions";

const TONE = {
  assigned: "neutral",
  en_route: "brand",
  arrived: "warning",
  picked_up: "brand",
  completed: "success",
  no_show: "danger",
  cancelled: "danger",
} as const;

function useShow() {
  const t = useTranslations();
  return (result: Result) => {
    if (result.ok) toast.success({ title: t(result.messageKey) });
    else toast.error({ title: t(result.errorKey), description: result.detail });
    return result.ok;
  };
}

/**
 * The dispatch board (CLAUDE.md §13, Phase 8b).
 *
 * Grouped by transfer, one line per VEHICLE — including the vehicles nobody is
 * driving yet, which is the whole reason the board exists. The empty line is
 * the work; a list of what is already assigned would be a report.
 *
 * The driver picker deliberately offers every active driver rather than
 * filtering out the ones who are already busy: the database refuses a clash
 * with a message that says which clash it was, and pre-filtering here would
 * mean a second copy of that rule quietly disagreeing with the first (§15, 7.3).
 */
export function DispatchBoard({
  rows,
  drivers,
  locale,
}: {
  rows: DispatchRow[];
  drivers: { id: string; name: string; code: string }[];
  locale: Locale;
}) {
  const t = useTranslations("drivers");
  const tDriver = useTranslations("driver");
  const [pending, startTransition] = useTransition();
  const [choice, setChoice] = useState<Record<string, string>>({});
  const show = useShow();
  const router = useRouter();

  if (rows.length === 0) {
    return (
      <Card>
        <CardBody className="py-12 text-center text-sm text-ink-muted">
          {t("emptyDispatch")}
        </CardBody>
      </Card>
    );
  }

  // One group per transfer leg, preserving the board's own ordering.
  const groups: DispatchRow[][] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last[0]?.transferItemId === row.transferItemId) last.push(row);
    else groups.push([row]);
  }

  const unfilled = rows.filter((r) => !r.assignmentId).length;

  return (
    <div className="space-y-4">
      {unfilled > 0 ? (
        <p className="rounded-control bg-warning-50 px-3 py-2 text-sm text-warning-700">
          {t("unfilledCount", { count: formatNumber(unfilled, locale) })}
        </p>
      ) : null}

      {groups.map((group) => {
        const head = group[0];
        if (!head) return null;
        return (
          <Card key={head.transferItemId}>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-3">
              <div className="min-w-0 space-y-1">
                <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                  <span className="text-lg tabular-nums" dir="ltr">
                    {head.pickupTime ? head.pickupTime.slice(0, 5) : "—"}
                  </span>
                  {locale === "ar"
                    ? `${head.fromName} ← ${head.toName}`
                    : `${head.fromName} → ${head.toName}`}
                </p>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                  <span className="font-mono" dir="ltr">
                    {head.reference}
                  </span>
                  {head.agencyName ? <span>{head.agencyName}</span> : null}
                  <span className="flex items-center gap-1">
                    <LuUsers className="size-3" aria-hidden />
                    {formatNumber(head.passengers, locale)}
                  </span>
                  {head.flightNumber ? (
                    <span className="flex items-center gap-1" dir="ltr">
                      <LuPlane className="size-3" aria-hidden />
                      {head.flightNumber}
                    </span>
                  ) : null}
                  <span>{head.vehicleName}</span>
                </p>
              </div>
              <Badge tone="neutral">
                {t("jobCount", { count: formatNumber(group.length, locale) })}
              </Badge>
            </div>

            <ul className="divide-y divide-border">
              {group.map((row) => {
                const key = `${row.transferItemId}:${row.vehicleSeq}`;
                return (
                  <li
                    key={key}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs text-ink-muted">
                        {t("vehicleLabel", {
                          seq: formatNumber(row.vehicleSeq, locale),
                          total: formatNumber(group.length, locale),
                        })}
                      </p>
                      {row.driverName ? (
                        <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
                          {row.driverName}
                          <span className="text-xs text-ink-muted" dir="ltr">
                            {row.driverPhone}
                          </span>
                          {row.assignmentStatus ? (
                            <Badge tone={TONE[row.assignmentStatus]}>
                              {tDriver(`status.${row.assignmentStatus}`)}
                            </Badge>
                          ) : null}
                        </p>
                      ) : (
                        <p className="text-sm text-ink-muted">{t("unassignedSeat")}</p>
                      )}
                    </div>

                    {row.assignmentId ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={pending}
                        onClick={() =>
                          startTransition(async () => {
                            if (show(await unassignDriverAction(row.assignmentId!))) router.refresh();
                          })
                        }
                      >
                        <LuUserMinus aria-hidden />
                        {t("unassign")}
                      </Button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <label className="sr-only" htmlFor={`driver-${key}`}>
                          {t("fields.driver")}
                        </label>
                        <select
                          id={`driver-${key}`}
                          value={choice[key] ?? ""}
                          onChange={(e) => setChoice((c) => ({ ...c, [key]: e.target.value }))}
                          className="h-9 cursor-pointer rounded-control border border-border bg-surface px-2.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
                        >
                          <option value="">—</option>
                          {drivers.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name} ({d.code})
                            </option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          loading={pending}
                          disabled={!choice[key]}
                          onClick={() =>
                            startTransition(async () => {
                              const fd = new FormData();
                              fd.set("transferItemId", row.transferItemId);
                              fd.set("driverId", choice[key] ?? "");
                              fd.set("vehicleSeq", String(row.vehicleSeq));
                              if (show(await assignDriverAction(fd))) {
                                setChoice((c) => ({ ...c, [key]: "" }));
                                router.refresh();
                              }
                            })
                          }
                        >
                          {t("assign")}
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
