import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { LuCalendarCheck } from "react-icons/lu";
import { isLocale } from "@/shared/i18n/config";
import { formatDate } from "@/shared/lib/format";
import { Card, CardBody } from "@/shared/ui/card";
import { getMyJobs } from "@/modules/driver-ops/infrastructure/drivers.repository";
import { JobCard } from "@/modules/driver-ops/presentation/job-card";

/** ISO date `days` from today, UTC. */
function isoOffset(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * A driver's jobs (CLAUDE.md §13, Phase 8b).
 *
 * Today first, then the next fortnight — the two questions a driver actually
 * has, in that order. A single list would bury this morning's airport run
 * under next week's.
 *
 * There is no price anywhere on this page, and none in the data behind it:
 * `my_driver_jobs()` returns no such column (§15, 12.5 applied to a screen).
 */
export default async function DriverJobsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations("driver");
  const today = isoOffset(0);
  const jobs = await getMyJobs({ from: today, to: isoOffset(14) }, locale);

  const todays = jobs.filter((j) => j.jobDate === today);
  const upcoming = jobs.filter((j) => j.jobDate > today);

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-ink">{t("todayTitle")}</h1>
          <p className="text-sm text-ink-muted" dir="ltr">
            {formatDate(today, locale)}
          </p>
        </div>

        {todays.length === 0 ? (
          <Card>
            <CardBody className="flex flex-col items-center gap-3 py-10 text-center">
              <LuCalendarCheck className="size-7 text-ink-subtle" aria-hidden />
              <p className="text-sm text-ink-muted">{t("emptyToday")}</p>
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-3">
            {todays.map((job) => (
              <JobCard key={job.assignmentId} job={job} locale={locale} />
            ))}
          </div>
        )}
      </section>

      {upcoming.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight text-ink">{t("upcomingTitle")}</h2>
          <div className="space-y-3">
            {upcoming.map((job) => (
              <JobCard key={job.assignmentId} job={job} locale={locale} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
