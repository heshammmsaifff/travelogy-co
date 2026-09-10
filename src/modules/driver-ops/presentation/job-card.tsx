"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { LuCheck, LuCar, LuMapPin, LuPhone, LuPlane, LuUsers } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { useRouter } from "@/shared/i18n/navigation";
import { confirmAction } from "@/shared/lib/confirm";
import { formatDate, formatNumber } from "@/shared/lib/format";
import { toast } from "@/shared/lib/toast";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import type { DriverJob } from "@/modules/driver-ops/infrastructure/drivers.repository";
import { advanceAssignmentAction } from "./driver-actions";

/** What a driver may tap next, given where the job has got to. */
const NEXT: Record<string, ("en_route" | "arrived" | "picked_up" | "completed" | "no_show")[]> = {
  assigned: ["en_route", "no_show"],
  en_route: ["arrived", "no_show"],
  arrived: ["picked_up", "no_show"],
  picked_up: ["completed"],
};

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
 * One job, as the driver sees it (CLAUDE.md §13, Phase 8b).
 *
 * Built for a phone held in one hand at an airport: big tap targets, the
 * pickup time and the guest's name first, and the next action as a single
 * button rather than a status dropdown. There is no price on this card and
 * none in the data behind it — `my_driver_jobs()` returns no such column.
 */
export function JobCard({ job, locale }: { job: DriverJob; locale: Locale }) {
  const t = useTranslations("driver");
  const tRoot = useTranslations();
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const router = useRouter();

  const next = NEXT[job.status] ?? [];
  const closed = ["completed", "no_show", "cancelled"].includes(job.status);

  const submit = (status: (typeof next)[number]) => {
    startTransition(async () => {
      if (status === "no_show") {
        const ok = await confirmAction({
          title: t("noShowConfirmTitle"),
          body: t("noShowConfirmBody"),
          confirmLabel: t("action.no_show"),
          cancelLabel: tCommon("cancel"),
          dir: locale === "ar" ? "rtl" : "ltr",
        });
        if (!ok) return;
      }
      const fd = new FormData();
      fd.set("assignmentId", job.assignmentId);
      fd.set("status", status);
      if (note.trim()) fd.set("notes", note);

      const result = await advanceAssignmentAction(fd);
      if (result.ok) {
        toast.success({ title: tRoot(result.messageKey) });
        setNote("");
        router.refresh();
      } else {
        toast.error({ title: tRoot(result.errorKey), description: result.detail });
      }
    });
  };

  return (
    <article className="space-y-4 rounded-card border border-border bg-surface p-4">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* The time is the biggest thing on the card: it is what a driver is
              checking when they glance at their phone. */}
          <p className="text-lg font-semibold text-ink" dir="ltr">
            {job.pickupTime ? job.pickupTime.slice(0, 5) : "—"}
            <span className="ms-2 text-sm font-normal text-ink-muted">
              {formatDate(job.jobDate, locale)}
            </span>
          </p>
          <Badge tone={TONE[job.status]}>{t(`status.${job.status}`)}</Badge>
        </div>

        <p className="flex items-start gap-2 font-medium text-ink">
          <LuMapPin className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
          <span>
            {locale === "ar"
              ? `${job.fromName} ← ${job.toName}`
              : `${job.fromName} → ${job.toName}`}
          </span>
        </p>

        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
          <span className="flex items-center gap-1.5">
            <LuCar className="size-4" aria-hidden />
            {job.vehicleName}
            {job.vehicles > 1
              ? ` · ${t("carOf", {
                  seq: formatNumber(job.vehicleSeq, locale),
                  total: formatNumber(job.vehicles, locale),
                })}`
              : ""}
          </span>
          <span className="flex items-center gap-1.5">
            <LuUsers className="size-4" aria-hidden />
            {t("passengers", { count: formatNumber(job.passengers, locale) })}
          </span>
          {job.flightNumber ? (
            <span className="flex items-center gap-1.5" dir="ltr">
              <LuPlane className="size-4" aria-hidden />
              {t("flight", { number: job.flightNumber })}
            </span>
          ) : null}
        </p>
      </header>

      <dl className="grid gap-3 border-t border-border pt-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-ink-muted">{t("guest")}</dt>
          <dd className="text-ink">{job.guestName}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-muted">{t("reference")}</dt>
          <dd className="font-mono text-xs text-ink" dir="ltr">
            {job.reference}
          </dd>
        </div>
        {job.pickupNotes ? (
          <div className="sm:col-span-2">
            <dt className="text-xs text-ink-muted">{t("notes")}</dt>
            <dd className="text-ink">{job.pickupNotes}</dd>
          </div>
        ) : null}
      </dl>

      {/* A telephone link rather than a copyable string: on the device this
          screen is built for, ringing the guest is one tap. */}
      {job.guestPhone ? (
        <a
          href={`tel:${job.guestPhone}`}
          className="flex h-11 items-center justify-center gap-2 rounded-control border border-border-strong text-sm font-medium text-ink transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <LuPhone className="size-4" aria-hidden />
          {t("call")} <span dir="ltr">{job.guestPhone}</span>
        </a>
      ) : null}

      {closed ? (
        job.driverNotes ? (
          <p className="rounded-control bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
            {t("yourNote")}: {job.driverNotes}
          </p>
        ) : null
      ) : (
        <div className="space-y-3 border-t border-border pt-3">
          <label className="block space-y-1.5">
            <span className="text-xs text-ink-muted">{t("yourNote")}</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder={t("notePlaceholder")}
              className="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
            />
          </label>

          {/* One button per legal next step. A dropdown of every status would
              let a driver mark a job completed before they had arrived — the
              database refuses that, but the screen should not offer it. */}
          <div className="flex flex-wrap gap-2">
            {next.map((status) => (
              <Button
                key={status}
                size="lg"
                variant={status === "no_show" ? "secondary" : "primary"}
                loading={pending}
                onClick={() => submit(status)}
                className="min-h-11 flex-1"
              >
                {status === "completed" ? <LuCheck aria-hidden /> : null}
                {t(`action.${status}`)}
              </Button>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
