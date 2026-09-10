import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Locale } from "@/shared/i18n/config";
import { formatCurrency } from "@/shared/lib/format";
import { createClient } from "@/shared/lib/supabase/server";
import { Badge } from "@/shared/ui/badge";
import { Card, CardBody, CardHeader } from "@/shared/ui/card";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { AgencyProfileForm } from "@/modules/agencies/presentation/agency-profile-form";

/**
 * The agent's own company profile (CLAUDE.md §13, Phase 4).
 *
 * Read through the caller's session, so the row arrives because RLS says it is
 * theirs — not because the query filtered for it.
 */
export default async function AgentProfilePage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("profile");
  const tCommon = await getTranslations("common");
  const user = await getCurrentUser();
  if (!user?.agency) notFound();

  const supabase = await createClient();
  const { data: agency } = await supabase
    .from("agencies")
    .select(
      "name, legal_name, email, phone, website, country_code, city, address, commercial_reg_no, tax_id, code, status, credit_limit, currency_code",
    )
    .eq("id", user.agency.id)
    .maybeSingle();

  if (!agency) notFound();

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("title")}</h1>
        <p className="max-w-prose text-sm text-ink-muted">{t("description")}</p>
      </div>

      {/* The account facts the agent cannot change. Shown rather than hidden,
          with the reason stated, so "why can't I edit this" has an answer. */}
      <Card>
        <CardHeader title={t("sections.account")} description={t("locked")} />
        <CardBody>
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-ink-muted">{t("fields.code")}</dt>
              <dd className="font-mono text-sm text-ink" dir="ltr">
                {agency.code}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">{t("fields.status")}</dt>
              <dd>
                <Badge tone={agency.status === "active" ? "success" : "warning"}>
                  {tCommon(`status.${agency.status}`)}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">{t("fields.creditLimit")}</dt>
              <dd className="text-sm font-medium text-ink tabular-nums">
                {formatCurrency(
                  Number(agency.credit_limit ?? 0),
                  locale,
                  agency.currency_code ?? "EGP",
                )}
              </dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("sections.identity")} />
        <CardBody>
          <AgencyProfileForm
            defaults={{
              name: agency.name ?? "",
              legalName: agency.legal_name ?? "",
              email: agency.email ?? "",
              phone: agency.phone ?? "",
              website: agency.website ?? "",
              city: agency.city ?? "",
              address: agency.address ?? "",
              commercialRegNo: agency.commercial_reg_no ?? "",
              taxId: agency.tax_id ?? "",
            }}
          />
        </CardBody>
      </Card>
    </main>
  );
}
