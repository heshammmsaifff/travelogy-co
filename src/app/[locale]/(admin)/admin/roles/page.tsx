import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden, notFound } from "next/navigation";
import { LuChevronLeft, LuChevronRight } from "react-icons/lu";
import { isLocale } from "@/shared/i18n/config";
import { Link } from "@/shared/i18n/navigation";
import { formatNumber } from "@/shared/lib/format";
import { Badge } from "@/shared/ui/badge";
import { Card, CardHeader } from "@/shared/ui/card";
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
import { listRoles } from "@/modules/auth/infrastructure/access.repository";
import { CreateRoleButton, DeleteRoleButton } from "@/modules/auth/presentation/role-manager";

/**
 * Role list.
 *
 * The layout already hid the nav tab for users without the permission; this
 * re-checks anyway, because a hidden link is not access control (§12).
 */
export default async function RolesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!can(user, "settings.roles.manage")) forbidden();

  const t = await getTranslations("access.roles");
  const roles = await listRoles();
  const Chevron = locale === "ar" ? LuChevronLeft : LuChevronRight;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("title")}</h1>
        <p className="max-w-prose text-sm text-ink-muted">{t("description")}</p>
      </div>

      <Card>
        <CardHeader title={t("listTitle")} actions={<CreateRoleButton />} />
        <TableShell>
          <TableHead>
            <TableHeaderCell>{t("colName")}</TableHeaderCell>
            <TableHeaderCell>{t("colKey")}</TableHeaderCell>
            <TableHeaderCell>{t("colScope")}</TableHeaderCell>
            <TableHeaderCell numeric>{t("colPermissions")}</TableHeaderCell>
            <TableHeaderCell numeric>{t("colUsers")}</TableHeaderCell>
            <TableHeaderCell />
          </TableHead>
          <TableBody>
            {roles.length === 0 ? (
              <TableEmpty colSpan={6}>{t("empty")}</TableEmpty>
            ) : (
              roles.map((role) => (
                <TableRow key={role.id}>
                  <TableCell>
                    <Link
                      href={`/admin/roles/${role.id}`}
                      className="font-medium text-ink hover:text-brand-700 hover:underline"
                    >
                      {locale === "ar" ? role.nameAr : role.nameEn}
                    </Link>
                    {role.isSystem ? (
                      <Badge tone="neutral" className="ms-2">
                        {t("systemRole")}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-ink-muted" dir="ltr">
                    {role.key}
                  </TableCell>
                  <TableCell>
                    <Badge tone={role.scope === "admin" ? "brand" : "neutral"}>
                      {t(`scope.${role.scope}`)}
                    </Badge>
                  </TableCell>
                  <TableCell numeric>
                    {/* super_admin's access is implicit, so a count of 0 would
                        read as "no access" — say so instead. */}
                    {role.key === "super_admin" ? (
                      <span className="text-xs text-ink-muted">{t("allPermissions")}</span>
                    ) : (
                      formatNumber(role.permissionCount, locale)
                    )}
                  </TableCell>
                  <TableCell numeric>{formatNumber(role.userCount, locale)}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <DeleteRoleButton role={role} locale={locale} />
                      <Link
                        href={`/admin/roles/${role.id}`}
                        aria-label={t("editLabel", {
                          name: locale === "ar" ? role.nameAr : role.nameEn,
                        })}
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
