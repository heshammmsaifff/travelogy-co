import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden, notFound } from "next/navigation";
import { isLocale } from "@/shared/i18n/config";
import { formatNumber } from "@/shared/lib/format";
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
  listChildPolicies,
} from "@/modules/hotels/infrastructure/hotels.repository";
import {
  AddCancellationPolicyButton,
  AddCancellationRuleButton,
  AddChildPolicyButton,
  DeleteChildPolicyButton,
  DeleteRuleButton,
} from "@/modules/hotels/presentation/policy-manager";

export default async function PoliciesPage({
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
  const tc = await getTranslations("hotels.chargeType");
  const canEdit = can(user, "hotels.rates.update");

  const [policies, childPolicies] = await Promise.all([
    listCancellationPolicies(id),
    listChildPolicies(id),
  ]);

  /** "50%" / "2 nights" / "1,200" — the shape depends on the charge type. */
  const describeCharge = (type: string, value: number) => {
    if (type === "percentage") return `${formatNumber(value, locale)}%`;
    if (type === "nights") return tc("nightsValue", { count: formatNumber(value, locale) });
    return formatNumber(value, locale);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={t("policies.title")}
          description={t("policies.description")}
          actions={canEdit ? <AddCancellationPolicyButton hotelId={id} /> : undefined}
        />
        <CardBody className="space-y-4">
          {policies.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("policies.empty")}</p>
          ) : (
            policies.map((p) => (
              <div key={p.id} className="rounded-control border border-border">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium text-ink">
                      {locale === "ar" ? p.nameAr : p.nameEn}
                      {p.isNonRefundable ? (
                        <Badge tone="danger">{t("policies.nonRefundable")}</Badge>
                      ) : null}
                    </p>
                    {(locale === "ar" ? p.descriptionAr : p.descriptionEn) ? (
                      <p className="text-xs text-ink-muted">
                        {locale === "ar" ? p.descriptionAr : p.descriptionEn}
                      </p>
                    ) : null}
                  </div>
                  {canEdit && !p.isNonRefundable ? (
                    <AddCancellationRuleButton policyId={p.id} hotelId={id} />
                  ) : null}
                </div>

                {p.isNonRefundable ? (
                  <p className="px-4 py-3 text-sm text-ink-muted">
                    {t("policies.nonRefundableNote")}
                  </p>
                ) : p.rules.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-ink-muted">{t("policies.noRules")}</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {p.rules.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                      >
                        <span className="text-ink">
                          {t("policies.ruleText", {
                            hours: formatNumber(r.hoursBeforeCheckin, locale),
                            charge: describeCharge(r.chargeType, r.chargeValue),
                          })}
                        </span>
                        {canEdit ? (
                          <DeleteRuleButton ruleId={r.id} hotelId={id} locale={locale} />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t("childPolicies.title")}
          description={t("childPolicies.description")}
          actions={canEdit ? <AddChildPolicyButton hotelId={id} /> : undefined}
        />
        <TableShell>
          <TableHead>
            <TableHeaderCell>{t("childPolicies.colAges")}</TableHeaderCell>
            <TableHeaderCell>{t("childPolicies.colCharge")}</TableHeaderCell>
            {canEdit ? <TableHeaderCell /> : null}
          </TableHead>
          <TableBody>
            {childPolicies.length === 0 ? (
              <TableEmpty colSpan={canEdit ? 3 : 2}>{t("childPolicies.empty")}</TableEmpty>
            ) : (
              childPolicies.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    {t("childPolicies.ageRange", {
                      from: formatNumber(c.ageFrom, locale),
                      to: formatNumber(c.ageTo, locale),
                    })}
                  </TableCell>
                  <TableCell>
                    {c.chargeType === "percentage" && c.chargeValue === 0 ? (
                      <Badge tone="success">{t("childPolicies.free")}</Badge>
                    ) : (
                      describeCharge(c.chargeType, c.chargeValue)
                    )}
                  </TableCell>
                  {canEdit ? (
                    <TableCell>
                      <div className="flex justify-end">
                        <DeleteChildPolicyButton policyId={c.id} hotelId={id} locale={locale} />
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </TableShell>
      </Card>
    </div>
  );
}
