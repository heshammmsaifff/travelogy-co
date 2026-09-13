import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden, notFound } from "next/navigation";
import { isLocale } from "@/shared/i18n/config";
import { can } from "@/modules/auth/domain/user";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { listAgencyApiKeys } from "@/modules/b2b-api/presentation/api-key-actions";
import { ApiKeysManager } from "@/modules/b2b-api/presentation/api-keys-manager";
import { ApiDocsViewer } from "@/modules/b2b-api/presentation/api-docs-viewer";

/**
 * Agent Portal: Developer & B2B API Management (Hotels B2B Hub §6.5, Phase 10).
 * Allows agency owners and developers to generate API keys, review usage rate limits,
 * and integrate via standard B2B REST endpoints and OpenAPI 3.1 documentation.
 */
export default async function AgentDeveloperPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user || !user.agency) forbidden();

  const t = await getTranslations("b2bApi");
  const keys = await listAgencyApiKeys(user.agency.id);
  const samplePrefix = keys[0]?.keyPrefix ?? "llt_live_your_api_key";

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("developerPageTitle")}</h1>
        <p className="max-w-prose text-sm text-ink-muted">{t("developerPageDescription")}</p>
      </div>

      <ApiKeysManager
        agencyId={user.agency.id}
        initialKeys={keys}
        locale={locale}
        // Permission, never a role name (§7): an owner can grant this to a sub-user.
        canManage={can(user, "agency_users.manage")}
      />

      <ApiDocsViewer samplePrefix={samplePrefix} />
    </main>
  );
}
