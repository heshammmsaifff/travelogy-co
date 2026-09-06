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
import { listAuditLog } from "@/modules/auth/infrastructure/access.repository";

const PAGE_SIZE = 50;

/** Colour by consequence: revocations and rejections read as losses. */
const ACTION_TONES: Record<string, "success" | "warning" | "danger" | "brand" | "neutral"> = {
  "role.created": "success",
  "role.deleted": "danger",
  "role.updated": "brand",
  "permission.granted": "warning",
  "permission.revoked": "neutral",
  "profile.role_changed": "warning",
  "profile.status_changed": "brand",
  "agency.status_changed": "brand",
  "agency.credit_limit_changed": "warning",
  bootstrap_super_admin: "danger",
};

/**
 * Audit trail (CLAUDE.md §7 rule 4).
 *
 * Read-only by construction: `audit_log` has a SELECT policy and nothing else,
 * so there is no code path — here or anywhere — that edits a row.
 */
export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!can(user, "audit.view")) forbidden();

  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const t = await getTranslations("audit");
  const { rows, total } = await listAuditLog(PAGE_SIZE, (page - 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const Prev = locale === "ar" ? LuChevronRight : LuChevronLeft;
  const Next = locale === "ar" ? LuChevronLeft : LuChevronRight;

  // Timestamps here are forensic, so they show the time as well as the date.
  const stamp = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Africa/Cairo",
  });

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("title")}</h1>
        <p className="max-w-prose text-sm text-ink-muted">{t("description")}</p>
      </div>

      <Card>
        <CardHeader
          title={t("listTitle")}
          description={t("listCount", { count: formatNumber(total, locale) })}
        />
        <TableShell>
          <TableHead>
            <TableHeaderCell>{t("colWhen")}</TableHeaderCell>
            <TableHeaderCell>{t("colActor")}</TableHeaderCell>
            <TableHeaderCell>{t("colAction")}</TableHeaderCell>
            <TableHeaderCell>{t("colDetails")}</TableHeaderCell>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={4}>{t("empty")}</TableEmpty>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs whitespace-nowrap text-ink-muted" dir="ltr">
                    {stamp.format(new Date(r.createdAt))}
                  </TableCell>
                  <TableCell className="text-xs" dir="ltr">
                    {r.actorEmail ?? t("systemActor")}
                  </TableCell>
                  <TableCell>
                    <Badge tone={ACTION_TONES[r.action] ?? "neutral"}>{r.action}</Badge>
                  </TableCell>
                  <TableCell>
                    {/* The payload shape differs per action, so it is rendered
                        as compact key=value pairs rather than pretending every
                        row has the same columns. */}
                    <span className="font-mono text-2xs break-all text-ink-muted" dir="ltr">
                      {r.changes && typeof r.changes === "object"
                        ? Object.entries(r.changes as Record<string, unknown>)
                            .map(([k, v]) => `${k}=${String(v)}`)
                            .join("  ")
                        : "—"}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </TableShell>

        {totalPages > 1 ? (
          <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
            <p className="text-xs text-ink-muted">
              {t("pageOf", {
                page: formatNumber(page, locale),
                total: formatNumber(totalPages, locale),
              })}
            </p>
            <div className="flex gap-1">
              {page > 1 ? (
                <Link
                  href={`/admin/audit?page=${page - 1}`}
                  className="rounded-control border border-border p-1.5 text-ink-muted hover:bg-surface-hover hover:text-ink"
                >
                  <Prev className="size-4" aria-hidden />
                </Link>
              ) : null}
              {page < totalPages ? (
                <Link
                  href={`/admin/audit?page=${page + 1}`}
                  className="rounded-control border border-border p-1.5 text-ink-muted hover:bg-surface-hover hover:text-ink"
                >
                  <Next className="size-4" aria-hidden />
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </Card>
    </main>
  );
}
