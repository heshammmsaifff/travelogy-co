import { getTranslations, setRequestLocale } from "next-intl/server";
import { LuBuilding2, LuCreditCard, LuIdCard } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { formatCurrency } from "@/shared/lib/format";
import { Badge } from "@/shared/ui/badge";
import { Card, CardBody, CardHeader } from "@/shared/ui/card";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { createClient } from "@/shared/lib/supabase/server";

/**
 * Agent dashboard shell.
 *
 * Phase 1 deliberately shows only what actually exists: the company's own
 * profile and its credit limit. Search, booking and quotations arrive in
 * Phases 3-4 and are listed here as honestly disabled rather than faked
 * (CLAUDE.md §2.3).
 */
export default async function AgentDashboard({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  const t = await getTranslations("agent.dashboard");
  const tCommon = await getTranslations("common");

  // Read through the user's own session so RLS applies — the agent sees this
  // row because it is theirs, not because the code filtered for it.
  const supabase = await createClient();
  const { data: agency } = await supabase
    .from("agencies")
    .select("name, code, credit_limit, currency_code, country_code, city, status")
    .eq("id", user!.agency!.id)
    .single();

  const upcoming = [
    { key: "search", icon: LuBuilding2 },
    { key: "bookings", icon: LuIdCard },
    { key: "statement", icon: LuCreditCard },
  ] as const;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          {t("greeting", { name: user!.fullName || user!.email })}
        </h1>
        <p className="text-sm text-ink-muted">{t("subtitle")}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader title={t("company.title")} />
          <CardBody>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">{t("company.name")}</dt>
                <dd className="font-medium text-ink">{agency?.name}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">{t("company.reference")}</dt>
                <dd className="font-mono text-xs text-ink-muted" dir="ltr">
                  {agency?.code}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">{t("company.status")}</dt>
                <dd>
                  <Badge tone={agency?.status === "active" ? "success" : "warning"}>
                    {tCommon(`status.${agency?.status}`)}
                  </Badge>
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("credit.title")} description={t("credit.description")} />
          <CardBody className="space-y-3">
            <div>
              <p className="text-xs text-ink-muted">{t("credit.limit")}</p>
              <p className="text-2xl font-semibold text-ink tabular-nums">
                {formatCurrency(
                  Number(agency?.credit_limit ?? 0),
                  locale,
                  agency?.currency_code ?? "EGP",
                )}
              </p>
            </div>
            {/* The running balance is derived from the payments ledger, which
                does not exist until Phase 5. Saying so beats showing a zero
                that would read as "you owe nothing". */}
            <p className="rounded-control bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
              {t("credit.balancePending")}
            </p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title={t("upcoming.title")} description={t("upcoming.description")} />
        <CardBody>
          <ul className="grid gap-3 sm:grid-cols-3">
            {upcoming.map(({ key, icon: Icon }) => (
              <li
                key={key}
                className="flex items-start gap-3 rounded-control border border-dashed border-border-strong p-4"
              >
                <Icon className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium text-ink">{t(`upcoming.${key}.title`)}</p>
                  <p className="text-xs text-ink-muted">{t(`upcoming.${key}.phase`)}</p>
                </div>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </main>
  );
}
