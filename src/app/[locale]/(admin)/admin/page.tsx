import { getTranslations, setRequestLocale } from "next-intl/server";
import { LuChevronLeft, LuChevronRight, LuShieldCheck, LuUsers } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { formatDate, formatNumber } from "@/shared/lib/format";
import { Link } from "@/shared/i18n/navigation";
import { buttonVariants } from "@/shared/ui/button-variants";
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
 * Back-office dashboard.
 *
 * Provides a live overview of the platform: pending registration requests awaiting review,
 * and the role/permission access model. Links directly to agency review workflows.
 */
export default async function AdminDashboard({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  const t = await getTranslations("admin.dashboard");
  const supabase = await createClient();

  const Chevron = locale === "ar" ? LuChevronLeft : LuChevronRight;

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
          actions={
            canViewAgencies ? (
              <Link
                href="/admin/agencies"
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                {t("requests.viewAll")}
                <Chevron className="size-4 ms-1" aria-hidden />
              </Link>
            ) : null
          }
        />
        <TableShell>
          <TableHead>
            <TableHeaderCell>{t("requests.colReference")}</TableHeaderCell>
            <TableHeaderCell>{t("requests.colCompany")}</TableHeaderCell>
            <TableHeaderCell>{t("requests.colEmail")}</TableHeaderCell>
            <TableHeaderCell>{t("requests.colCountry")}</TableHeaderCell>
            <TableHeaderCell>{t("requests.colDate")}</TableHeaderCell>
            <TableHeaderCell />
          </TableHead>
          <TableBody>
            {(pendingAgencies ?? []).length === 0 ? (
              <TableEmpty colSpan={6}>
                {canViewAgencies ? t("requests.empty") : t("requests.noPermission")}
              </TableEmpty>
            ) : (
              (pendingAgencies ?? []).map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono text-xs" dir="ltr">
                    <Link
                      href={`/admin/agencies/${a.id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {a.code}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/agencies/${a.id}`}
                      className="font-medium text-ink hover:text-brand-700 hover:underline"
                    >
                      {a.name}
                    </Link>
                  </TableCell>
                  <TableCell dir="ltr">{a.email}</TableCell>
                  <TableCell dir="ltr">{a.country_code}</TableCell>
                  <TableCell className="text-xs text-ink-muted">
                    {formatDate(a.created_at, locale)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <Link
                        href={`/admin/agencies/${a.id}`}
                        aria-label={t("requests.reviewAction", { name: a.name })}
                        className="rounded-control p-1.5 text-ink-subtle hover:bg-surface-hover hover:text-ink"
                      >
                        <Chevron className="size-4" aria-hidden />
                      </Link>
                    </div>
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
