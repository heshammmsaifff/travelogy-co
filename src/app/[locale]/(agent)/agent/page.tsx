import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  LuBuilding2,
  LuBus,
  LuCalendarClock,
  LuCreditCard,
  LuFileText,
  LuMapPinned,
  LuReceipt,
  LuSearch,
  LuUsers,
} from "react-icons/lu";
import { Link } from "@/shared/i18n/navigation";
import type { Locale } from "@/shared/i18n/config";
import { formatCurrency } from "@/shared/lib/format";
import { Badge } from "@/shared/ui/badge";
import { Card, CardBody, CardHeader } from "@/shared/ui/card";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { createClient } from "@/shared/lib/supabase/server";
import { getCreditSummary } from "@/modules/bookings/infrastructure/bookings.repository";

/**
 * Agent dashboard shell.
 *
 * Shows only what actually exists. Phase 4 turned search, quotations and the
 * company profile on, so they moved out of the "coming next" list and into
 * real links — leaving a card saying a working feature is unavailable would be
 * the same dishonesty as the reverse (CLAUDE.md §2.3).
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

  const tLinks = await getTranslations("agent.dashboard.quickLinks");
  const tCredit = await getTranslations("credit");

  // Computed by the database from the booking ledger (§10), never a
  // number this page adds up itself.
  const credit = await getCreditSummary();

  const quickLinks = [
    { key: "search", href: "/agent/search" },
    { key: "transfers", href: "/agent/transfers" },
    { key: "packages", href: "/agent/packages" },
    { key: "quotations", href: "/agent/quotations" },
    { key: "bookings", href: "/agent/bookings" },
    { key: "statement", href: "/agent/statement" },
    { key: "team", href: "/agent/team" },
    { key: "profile", href: "/agent/profile" },
  ] as const;

  // Kept out of the quickLinks table so that stays plain data.
  const linkIcon = (key: (typeof quickLinks)[number]["key"]) => {
    if (key === "search")
      return <LuSearch className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />;
    if (key === "transfers")
      return <LuBus className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />;
    if (key === "packages")
      return <LuMapPinned className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />;
    if (key === "quotations")
      return <LuFileText className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />;
    if (key === "bookings")
      return <LuCalendarClock className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />;
    if (key === "statement")
      return <LuReceipt className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />;
    if (key === "team")
      return <LuUsers className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />;
    return <LuBuilding2 className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />;
  };

  const upcoming: readonly string[] = [];

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
          <CardHeader title={tCredit("title")} />
          <CardBody className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <p className="text-xs text-ink-muted">{tCredit("limit")}</p>
                <p className="text-lg font-semibold text-ink tabular-nums">
                  {formatCurrency(
                    credit?.creditLimit ?? Number(agency?.credit_limit ?? 0),
                    locale,
                    credit?.currencyCode ?? agency?.currency_code ?? "EGP",
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-muted">{tCredit("outstanding")}</p>
                <p className="text-lg font-semibold text-ink tabular-nums">
                  {formatCurrency(
                    credit?.outstanding ?? 0,
                    locale,
                    credit?.currencyCode ?? agency?.currency_code ?? "EGP",
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-muted">{tCredit("available")}</p>
                <p className="text-lg font-semibold text-brand-700 tabular-nums">
                  {formatCurrency(
                    credit?.available ?? 0,
                    locale,
                    credit?.currencyCode ?? agency?.currency_code ?? "EGP",
                  )}
                </p>
              </div>
            </div>
            <p className="rounded-control bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
              {tCredit("description")}
            </p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title={tLinks("title")} description={tLinks("description")} />
        <CardBody>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {quickLinks.map(({ key, href }) => (
              <li key={key}>
                <Link
                  href={href}
                  className="flex h-full items-start gap-3 rounded-control border border-border p-4 transition-colors hover:border-brand-300 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus"
                >
                  {linkIcon(key)}
                  <span className="min-w-0 space-y-1">
                    <span className="block text-sm font-medium text-ink">
                      {tLinks(`${key}.title`)}
                    </span>
                    <span className="block text-xs text-ink-muted">{tLinks(`${key}.body`)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      {upcoming.length > 0 ? (
        <Card>
          <CardHeader title={t("upcoming.title")} description={t("upcoming.description")} />
          <CardBody>
            <ul className="grid gap-3 sm:grid-cols-2">
              {upcoming.map((key) => (
                <li
                  key={key}
                  className="flex items-start gap-3 rounded-control border border-dashed border-border-strong p-4"
                >
                  <LuCreditCard className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium text-ink">{t(`upcoming.${key}.title`)}</p>
                    <p className="text-xs text-ink-muted">{t(`upcoming.${key}.phase`)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </main>
  );
}
