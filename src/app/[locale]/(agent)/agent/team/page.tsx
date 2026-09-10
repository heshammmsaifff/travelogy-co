import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Locale } from "@/shared/i18n/config";
import { formatDate } from "@/shared/lib/format";
import { createClient } from "@/shared/lib/supabase/server";
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
import { listAgentRoles } from "@/modules/auth/infrastructure/access.repository";
import {
  AgencyUserStatusButton,
  CreateAgencyMemberButton,
} from "@/modules/agencies/presentation/agency-member-controls";

const STATUS_TONES = {
  pending: "warning",
  active: "success",
  suspended: "danger",
  rejected: "neutral",
} as const;

export default async function AgentTeamPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user?.agency) notFound();
  const agency = user.agency;

  const t = await getTranslations("agent.team");
  const tCommon = await getTranslations("common");

  const canManage = can(user, "agency_users.manage");

  const supabase = await createClient();
  const [{ data: members }, agentRoles] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, status, created_at, roles!inner(key, name_ar, name_en)")
      .eq("agency_id", agency.id)
      .order("created_at"),
    canManage ? listAgentRoles() : Promise.resolve([]),
  ]);

  type RoleRel = { key: string; name_ar: string; name_en: string };
  const teamList = (members ?? []).map((m) => {
    const role = (Array.isArray(m.roles) ? m.roles[0] : m.roles) as unknown as RoleRel;
    return {
      id: m.id,
      email: m.email,
      fullName: m.full_name,
      status: m.status,
      roleKey: role?.key,
      roleNameAr: role?.name_ar,
      roleNameEn: role?.name_en,
      createdAt: m.created_at,
    };
  });

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("title")}</h1>
        <p className="max-w-prose text-sm text-ink-muted">{t("description")}</p>
      </div>

      <Card>
        <CardHeader
          title={t("listTitle")}
          actions={
            canManage && agentRoles.length > 0 ? (
              <CreateAgencyMemberButton
                agencyId={agency.id}
                roles={agentRoles}
                locale={locale}
                namespace="agent.team"
              />
            ) : null
          }
        />
        <TableShell>
          <TableHead>
            <TableHeaderCell>{t("colName")}</TableHeaderCell>
            <TableHeaderCell>{t("colEmail")}</TableHeaderCell>
            <TableHeaderCell>{t("colRole")}</TableHeaderCell>
            <TableHeaderCell>{t("colStatus")}</TableHeaderCell>
            <TableHeaderCell>{t("colCreated")}</TableHeaderCell>
            {canManage ? <TableHeaderCell /> : null}
          </TableHead>
          <TableBody>
            {teamList.length === 0 ? (
              <TableEmpty colSpan={canManage ? 6 : 5}>{t("empty")}</TableEmpty>
            ) : (
              teamList.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium text-ink">
                    {m.fullName || "—"}
                    {m.id === user.id ? (
                      <Badge tone="neutral" className="ms-2">
                        {locale === "ar" ? "أنت" : "You"}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell dir="ltr">{m.email}</TableCell>
                  <TableCell>{locale === "ar" ? m.roleNameAr : m.roleNameEn}</TableCell>
                  <TableCell>
                    <Badge tone={STATUS_TONES[m.status as keyof typeof STATUS_TONES] ?? "neutral"}>
                      {tCommon(`status.${m.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-ink-muted">
                    {formatDate(m.createdAt, locale)}
                  </TableCell>
                  {canManage ? (
                    <TableCell>
                      <div className="flex justify-end">
                        <AgencyUserStatusButton
                          agencyId={agency.id}
                          member={m}
                          currentUserId={user.id}
                          locale={locale}
                          namespace="agent.team"
                        />
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </TableShell>
      </Card>
    </main>
  );
}
