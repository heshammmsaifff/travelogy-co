import { getTranslations, setRequestLocale } from "next-intl/server";
import { LuShieldCheck, LuUsers } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
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
import { createClient } from "@/shared/lib/supabase/server";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { can } from "@/modules/auth/domain/user";

/**
 * Back-office dashboard shell.
 *
 * Shows the two things Phase 1 actually produced: pending registration
 * requests, and the role/permission model. Approving an agent is Phase 2, so
 * the list is read-only here and says so rather than offering a button that
 * would do nothing (CLAUDE.md §2.3).
 */
export default async function AdminDashboard({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  const t = await getTranslations("admin.dashboard");
  const tCommon = await getTranslations("common");
  const supabase = await createClient();

  // §11: explicit columns, bounded page — never an unbounded table read.
  const canViewAgencies = can(user, "agencies.view");

  const { data: pendingAgencies } = canViewAgencies
    ? await supabase
        .from("agencies")
        .select("id, code, name, email, country_code, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(10)
    : { data: [] };

  const { count: roleCount } = await supabase
    .from("roles")
    .select("*", { count: "exact", head: true });

  const { count: permissionCount } = await supabase
    .from("permissions")
    .select("*", { count: "exact", head: true });

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          {t("greeting", { name: user!.fullName || user!.email })}
        </h1>
        <p className="text-sm text-ink-muted">{t("subtitle")}</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardBody className="flex items-center gap-4">
            <span className="rounded-control bg-brand-50 p-2.5">
              <LuUsers className="size-5 text-brand-600" aria-hidden />
            </span>
            <div>
              <p className="text-xs text-ink-muted">{t("stats.pendingRequests")}</p>
              <p className="text-xl font-semibold text-ink tabular-nums">
                {formatNumber(pendingAgencies?.length ?? 0, locale)}
              </p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="flex items-center gap-4">
            <span className="rounded-control bg-brand-50 p-2.5">
              <LuShieldCheck className="size-5 text-brand-600" aria-hidden />
            </span>
            <div>
              <p className="text-xs text-ink-muted">{t("stats.accessModel")}</p>
              <p className="text-xl font-semibold text-ink tabular-nums">
                {t("stats.rolesAndPermissions", {
                  roles: formatNumber(roleCount ?? 0, locale),
                  permissions: formatNumber(permissionCount ?? 0, locale),
                })}
              </p>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title={t("requests.title")}
          description={t("requests.description")}
          actions={<Badge tone="warning">{tCommon("comingSoon")}</Badge>}
        />
        <TableShell>
          <TableHead>
            <TableHeaderCell>{t("requests.colReference")}</TableHeaderCell>
            <TableHeaderCell>{t("requests.colCompany")}</TableHeaderCell>
            <TableHeaderCell>{t("requests.colEmail")}</TableHeaderCell>
            <TableHeaderCell>{t("requests.colCountry")}</TableHeaderCell>
          </TableHead>
          <TableBody>
            {(pendingAgencies ?? []).length === 0 ? (
              <TableEmpty colSpan={4}>
                {canViewAgencies ? t("requests.empty") : t("requests.noPermission")}
              </TableEmpty>
            ) : (
              (pendingAgencies ?? []).map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono text-xs" dir="ltr">
                    {a.code}
                  </TableCell>
                  <TableCell>{a.name}</TableCell>
                  <TableCell dir="ltr">{a.email}</TableCell>
                  <TableCell dir="ltr">{a.country_code}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </TableShell>
      </Card>
    </main>
  );
}
