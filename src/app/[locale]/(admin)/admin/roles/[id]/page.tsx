import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden, notFound } from "next/navigation";
import { isLocale } from "@/shared/i18n/config";
import { Link } from "@/shared/i18n/navigation";
import { Badge } from "@/shared/ui/badge";
import { Card, CardBody, CardHeader } from "@/shared/ui/card";
import { can } from "@/modules/auth/domain/user";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { getRole, listPermissionsByModule } from "@/modules/auth/infrastructure/access.repository";
import { PermissionMatrix, RoleDetailsForm } from "@/modules/auth/presentation/role-manager";

/** Role editor: labels, plus the permission matrix (CLAUDE.md §7). */
export default async function RoleDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!can(user, "settings.roles.manage")) forbidden();

  const [role, modules] = await Promise.all([getRole(id), listPermissionsByModule()]);
  if (!role) notFound();

  const t = await getTranslations("access.roles");
  const roleName = locale === "ar" ? role.nameAr : role.nameEn;

  // §7 rule 5: you cannot grant what you do not hold. A super_admin holds
  // everything implicitly, so the matrix is fully enabled for them.
  const grantable = user!.role.key === "super_admin" ? ("all" as const) : [...user!.permissions];

  // super_admin's grants are meaningless (its access short-circuits) and the
  // database refuses to write them, so the matrix is shown read-only.
  const isSuperAdminRole = role.key === "super_admin";

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-2">
        <Link href="/admin/roles" className="text-sm text-ink-muted hover:text-ink hover:underline">
          {t("backToList")}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{roleName}</h1>
          {role.isSystem ? <Badge tone="neutral">{t("systemRole")}</Badge> : null}
          <span className="font-mono text-xs text-ink-subtle" dir="ltr">
            {role.key}
          </span>
        </div>
      </div>

      <Card>
        <CardHeader title={t("detailsTitle")} description={t("detailsDescription")} />
        <CardBody>
          <RoleDetailsForm role={role} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t("permissionsTitle")}
          description={isSuperAdminRole ? t("superAdminImplicit") : t("permissionsDescription")}
        />
        <CardBody>
          <PermissionMatrix
            roleId={role.id}
            modules={[...modules.entries()]}
            granted={role.permissionKeys}
            grantable={grantable}
            locale={locale}
            readOnly={isSuperAdminRole}
          />
        </CardBody>
      </Card>
    </main>
  );
}
