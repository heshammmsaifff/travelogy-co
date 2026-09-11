import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden, notFound } from "next/navigation";
import { LuUpload } from "react-icons/lu";
import { isLocale } from "@/shared/i18n/config";
import { Link } from "@/shared/i18n/navigation";
import { formatCurrency, formatDate, formatNumber } from "@/shared/lib/format";
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
import {
  listCancellationPolicies,
  listMealPlans,
  listRatePlans,
  listRates,
  listRoomTypes,
} from "@/modules/hotels/infrastructure/hotels.repository";
import {
  AddPlanButton,
  AddRateButton,
  EditPlanButton,
  PlanStatusBadge,
  RateRowActions,
} from "@/modules/hotels/presentation/rate-manager";

/**
 * Contract rates.
 *
 * Structured as plan-then-seasons because that is how a hotel contract is
 * negotiated: one commercial agreement (board basis, currency, cancellation
 * terms) with a price table underneath it.
 */
export default async function RatesPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!can(user, "hotels.rates.view")) forbidden();

  const t = await getTranslations("hotels");
  const canEdit = can(user, "hotels.rates.update");

  const [plans, rooms, mealPlans, policies] = await Promise.all([
    listRatePlans(id),
    listRoomTypes(id),
    listMealPlans(),
    listCancellationPolicies(id),
  ]);

  // One query per plan, and plans per hotel are a handful — a single query
  // returning every rate would be harder to page and no cheaper in practice.
  const ratesByPlan = new Map(
    await Promise.all(plans.map(async (p) => [p.id, await listRates(p.id)] as const)),
  );

  const roomOptions = rooms.map((r) => ({
    id: r.id,
    code: r.code,
    nameAr: r.nameAr,
    nameEn: r.nameEn,
  }));
  const policyOptions = policies.map((p) => ({ id: p.id, nameAr: p.nameAr, nameEn: p.nameEn }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={t("plans.title")}
          description={t("plans.description")}
          actions={
            canEdit && rooms.length > 0 ? (
              <div className="flex items-center gap-2">
                <Link
                  href="/admin/hotels/rates-upload"
                  className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-hover"
                >
                  <LuUpload className="size-3.5" aria-hidden />
                  <span>{t("uploadRates")}</span>
                </Link>
                <AddPlanButton
                  hotelId={id}
                  mealPlans={mealPlans}
                  policies={policyOptions}
                  locale={locale}
                />
              </div>
            ) : undefined
          }
        />
        {rooms.length === 0 ? (
          // Rates price rooms; without one there is nothing to price. Say so
          // rather than offering a form that cannot be completed.
          <CardBody>
            <p className="rounded-control bg-warning-50 px-3 py-2 text-sm text-warning-700">
              {t("plans.needRoomsFirst")}
            </p>
          </CardBody>
        ) : plans.length === 0 ? (
          <CardBody>
            <p className="text-sm text-ink-muted">{t("plans.empty")}</p>
          </CardBody>
        ) : null}
      </Card>

      {plans.map((plan) => {
        const rates = ratesByPlan.get(plan.id) ?? [];
        return (
          <Card key={plan.id}>
            <CardHeader
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {locale === "ar" ? plan.nameAr : plan.nameEn}
                  <span className="font-mono text-2xs text-ink-subtle" dir="ltr">
                    {plan.code}
                  </span>
                  <PlanStatusBadge status={plan.status} />
                  <Badge tone="neutral">
                    {plan.mealPlanKey} ·{" "}
                    {locale === "ar" ? plan.mealPlanNameAr : plan.mealPlanNameEn}
                  </Badge>
                </span>
              }
              description={t("plans.validity", {
                from: formatDate(plan.validFrom, locale),
                to: formatDate(plan.validTo, locale),
              })}
              actions={
                canEdit ? (
                  <span className="flex items-center gap-1">
                    <AddRateButton
                      ratePlanId={plan.id}
                      hotelId={id}
                      rooms={roomOptions}
                      currency={plan.currencyCode}
                      locale={locale}
                    />
                    <EditPlanButton
                      hotelId={id}
                      plan={plan}
                      mealPlans={mealPlans}
                      policies={policyOptions}
                      locale={locale}
                    />
                  </span>
                ) : undefined
              }
            />

            <TableShell>
              <TableHead>
                <TableHeaderCell>{t("rates.colRoom")}</TableHeaderCell>
                <TableHeaderCell>{t("rates.colSeason")}</TableHeaderCell>
                <TableHeaderCell numeric>{t("rates.colPrice")}</TableHeaderCell>
                <TableHeaderCell numeric>{t("rates.colExtras")}</TableHeaderCell>
                <TableHeaderCell numeric>{t("rates.colStay")}</TableHeaderCell>
                {canEdit ? <TableHeaderCell /> : null}
              </TableHead>
              <TableBody>
                {rates.length === 0 ? (
                  <TableEmpty colSpan={canEdit ? 6 : 5}>{t("rates.empty")}</TableEmpty>
                ) : (
                  rates.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <span className="text-ink">
                          {locale === "ar" ? r.roomNameAr : r.roomNameEn}
                        </span>
                        <span className="block font-mono text-2xs text-ink-subtle" dir="ltr">
                          {r.roomCode}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="whitespace-nowrap">
                          {formatDate(r.dateFrom, locale)} — {formatDate(r.dateTo, locale)}
                        </span>
                        {r.isClosed ? (
                          <Badge tone="danger" className="ms-2">
                            {t("rates.closed")}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell numeric>
                        {formatCurrency(r.pricePerNight, locale, plan.currencyCode)}
                      </TableCell>
                      <TableCell numeric>
                        <span className="text-2xs text-ink-muted">
                          {t("rates.extrasSummary", {
                            adult: formatCurrency(r.extraAdultPrice, locale, plan.currencyCode),
                            child: formatCurrency(r.extraChildPrice, locale, plan.currencyCode),
                          })}
                        </span>
                      </TableCell>
                      <TableCell numeric>
                        {formatNumber(r.minStay, locale)}
                        {r.maxStay ? `–${formatNumber(r.maxStay, locale)}` : "+"}
                      </TableCell>
                      {canEdit ? (
                        <TableCell>
                          <RateRowActions
                            rate={r}
                            ratePlanId={plan.id}
                            hotelId={id}
                            rooms={roomOptions}
                            currency={plan.currencyCode}
                            locale={locale}
                          />
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </TableShell>
          </Card>
        );
      })}
    </div>
  );
}
