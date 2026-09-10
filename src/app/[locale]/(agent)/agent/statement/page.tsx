import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Locale } from "@/shared/i18n/config";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import {
  getMyCreditPosition,
  getStatement,
} from "@/modules/finance/infrastructure/finance.repository";
import {
  CreditPositionCards,
  StatementTable,
} from "@/modules/finance/presentation/statement-view";

/**
 * The agent's own statement of account (CLAUDE.md §10, §13 Phase 5b).
 *
 * Read through the caller's session: `agency_statement` refuses an account
 * that is not theirs, so the page cannot show the wrong one even if the id
 * were wrong.
 */
export default async function AgentStatementPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user?.agency) notFound();

  const t = await getTranslations("finance");
  const [position, entries] = await Promise.all([
    getMyCreditPosition(),
    getStatement(user.agency.id),
  ]);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("statementTitle")}</h1>
        <p className="max-w-prose text-sm text-ink-muted">{t("statementDescription")}</p>
      </div>

      {position ? <CreditPositionCards position={position} locale={locale} /> : null}

      <StatementTable entries={entries} locale={locale} />
    </main>
  );
}
