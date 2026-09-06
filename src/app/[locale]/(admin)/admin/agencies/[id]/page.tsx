import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden, notFound } from "next/navigation";
import { isLocale } from "@/shared/i18n/config";
import { Link } from "@/shared/i18n/navigation";
import { formatCurrency, formatDate } from "@/shared/lib/format";
import { Badge } from "@/shared/ui/badge";
import { Card, CardBody, CardHeader } from "@/shared/ui/card";
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
import { getAgency } from "@/modules/agencies/infrastructure/agencies.repository";
import {
  AgencyProfileForm,
  ApprovalControls,
  CreditLimitForm,
  SuspendControl,
} from "@/modules/agencies/presentation/agency-controls";

const STATUS_TONES = {
  pending: "warning",
  active: "success",
  suspended: "danger",
  rejected: "neutral",
} as const;

export default async function AgencyDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!can(user, "agencies.view")) forbidden();

  const agency = await getAgency(id);
  if (!agency) notFound();

  const t = await getTranslations("agencies");
  const tCommon = await getTranslations("common");

  const canApprove = can(user, "agencies.approve");
  const canSuspend = can(user, "agencies.suspend");
  const canSetCredit = can(user, "agencies.credit_limit.update");
  const canEdit = can(user, "agencies.update");

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-2">
        <Link
          href="/admin/agencies"
          className="text-sm text-ink-muted hover:text-ink hover:underline"
        >
          {t("backToList")}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{agency.name}</h1>
          <Badge tone={STATUS_TONES[agency.status as keyof typeof STATUS_TONES] ?? "neutral"}>
            {tCommon(`status.${agency.status}`)}
          </Badge>
          <span className="font-mono text-xs text-ink-subtle" dir="ltr">
            {agency.code}
          </span>
        </div>
      </div>

      {/* A rejected application keeps its reason on screen: the admin who
          follows up needs to know what was said. */}
      {agency.status === "rejected" && agency.rejectionReason ? (
        <div className="rounded-control border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          <span className="font-medium">
            {t("rejectedOn", { date: formatDate(agency.rejectedAt!, locale) })}
          </span>
          <span className="block">{agency.rejectionReason}</span>
        </div>
      ) : null}

      {/* Lifecycle actions, shown only for the transitions that make sense from
          the current status — never a button that would be refused. */}
      {(canApprove && agency.status === "pending") ||
      (canSuspend && (agency.status === "active" || agency.status === "suspended")) ? (
        <Card>
          <CardHeader title={t("actions.title")} description={t("actions.description")} />
          <CardBody className="flex flex-wrap gap-2">
            {agency.status === "pending" && canApprove ? (
              <ApprovalControls agencyId={agency.id} locale={locale} />
            ) : null}
            {(agency.status === "active" || agency.status === "suspended") && canSuspend ? (
              <SuspendControl agencyId={agency.id} status={agency.status} locale={locale} />
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader title={t("credit.title")} description={t("credit.description")} />
          <CardBody className="space-y-3">
            {canSetCredit ? (
              <CreditLimitForm
                agencyId={agency.id}
                creditLimit={agency.creditLimit}
                currencyCode={agency.currencyCode}
              />
            ) : (
              <div>
                <p className="text-xs text-ink-muted">{t("colCreditLimit")}</p>
                <p className="text-xl font-semibold text-ink tabular-nums">
                  {formatCurrency(agency.creditLimit, locale, agency.currencyCode)}
                </p>
              </div>
            )}
            <p className="rounded-control bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
              {t("credit.ledgerNote")}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("summary.title")} />
          <CardBody>
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">{t("fields.email")}</dt>
                <dd className="text-ink" dir="ltr">
                  {agency.email}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">{t("fields.country")}</dt>
                <dd className="text-ink" dir="ltr">
                  {agency.countryCode}
                  {agency.city ? ` · ${agency.city}` : ""}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">{t("registeredOn")}</dt>
                <dd className="text-ink">{formatDate(agency.createdAt, locale)}</dd>
              </div>
              {agency.approvedAt ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-muted">{t("approvedOn")}</dt>
                  <dd className="text-ink">{formatDate(agency.approvedAt, locale)}</dd>
                </div>
              ) : null}
            </dl>
          </CardBody>
        </Card>
      </div>

      {canEdit ? (
        <Card>
          <CardHeader title={t("profile.title")} description={t("profile.description")} />
          <CardBody>
            <AgencyProfileForm agency={agency} />
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title={t("members.title")} description={t("members.description")} />
        <TableShell>
          <TableHead>
            <TableHeaderCell>{t("members.colName")}</TableHeaderCell>
            <TableHeaderCell>{t("members.colEmail")}</TableHeaderCell>
            <TableHeaderCell>{t("members.colRole")}</TableHeaderCell>
            <TableHeaderCell>{t("members.colStatus")}</TableHeaderCell>
          </TableHead>
          <TableBody>
            {agency.members.length === 0 ? (
              <TableEmpty colSpan={4}>{t("members.empty")}</TableEmpty>
            ) : (
              agency.members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{m.fullName || "—"}</TableCell>
                  <TableCell dir="ltr">{m.email}</TableCell>
                  <TableCell>{locale === "ar" ? m.roleNameAr : m.roleNameEn}</TableCell>
                  <TableCell>
                    <Badge tone={STATUS_TONES[m.status as keyof typeof STATUS_TONES] ?? "neutral"}>
                      {tCommon(`status.${m.status}`)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </TableShell>
      </Card>
    </main>
  );
}
