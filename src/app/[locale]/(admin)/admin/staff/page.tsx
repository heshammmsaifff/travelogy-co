import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden, notFound } from "next/navigation";
import { isLocale } from "@/shared/i18n/config";
import { formatDate } from "@/shared/lib/format";
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
import { listRoles, listStaff } from "@/modules/auth/infrastructure/access.repository";
import {
  CreateStaffButton,
  StaffRoleSelect,
  StaffStatusButton,
} from "@/modules/auth/presentation/staff-manager";

const STATUS_TONES = {
  active: "success",
  suspended: "danger",
  pending: "warning",
  rejected: "neutral",
} as const;

export default async function StaffPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!can(user, "staff.view")) forbidden();

  const t = await getTranslations("access.staff");
  const tCommon = await getTranslations("common");
  const [staff, roles] = await Promise.all([listStaff(), listRoles()]);

  const canCreate = can(user, "staff.create");
  const canUpdate = can(user, "staff.update");
  const canSuspend = can(user, "staff.suspend");

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("title")}</h1>
        <p className="max-w-prose text-sm text-ink-muted">{t("description")}</p>
      </div>

      <Card>
        <CardHeader
          title={t("listTitle")}
          actions={canCreate ? <CreateStaffButton roles={roles} /> : undefined}
        />
        <TableShell>
          <TableHead>
            <TableHeaderCell>{t("colName")}</TableHeaderCell>
            <TableHeaderCell>{t("colEmail")}</TableHeaderCell>
            <TableHeaderCell>{t("colRole")}</TableHeaderCell>
            <TableHeaderCell>{t("colStatus")}</TableHeaderCell>
            <TableHeaderCell numeric>{t("colCreated")}</TableHeaderCell>
            <TableHeaderCell />
          </TableHead>
          <TableBody>
            {staff.length === 0 ? (
              <TableEmpty colSpan={6}>{t("empty")}</TableEmpty>
            ) : (
              staff.map((s) => {
                const isSelf = s.id === user!.id;
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <span className="font-medium text-ink">{s.fullName || "—"}</span>
                      {isSelf ? (
                        <Badge tone="brand" className="ms-2">
                          {t("you")}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell dir="ltr">{s.email}</TableCell>
                    <TableCell>
                      {/* Nobody edits their own role, and super_admin can only
                          be granted by another super_admin — both are refused
                          by the database, so the control is disabled here
                          rather than offered and then rejected. */}
                      {canUpdate && !isSelf && s.roleKey !== "super_admin" ? (
                        <StaffRoleSelect staff={s} roles={roles} />
                      ) : (
                        <Badge tone={s.roleKey === "super_admin" ? "danger" : "neutral"}>
                          {locale === "ar" ? s.roleNameAr : s.roleNameEn}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        tone={STATUS_TONES[s.status as keyof typeof STATUS_TONES] ?? "neutral"}
                      >
                        {tCommon(`status.${s.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell numeric>{formatDate(s.createdAt, locale)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        {canSuspend && !isSelf ? (
                          <StaffStatusButton staff={s} locale={locale} />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </TableShell>
      </Card>
    </main>
  );
}
