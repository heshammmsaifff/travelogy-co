import { getTranslations, setRequestLocale } from "next-intl/server";
import { forbidden, notFound } from "next/navigation";
import { isLocale } from "@/shared/i18n/config";
import { Card, CardBody, CardHeader } from "@/shared/ui/card";
import { can } from "@/modules/auth/domain/user";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { createClient } from "@/shared/lib/supabase/server";
import { knownProviderKeys } from "@/modules/hotels/infrastructure/providers/registry";
import { SupplierCard, type SupplierRow } from "@/modules/hotels/presentation/supplier-manager";

/**
 * Which credential fields each provider needs.
 *
 * Declared here rather than in the database because it is a property of the
 * adapter's code, not of the deployment — a provider whose API changes needs a
 * code change anyway.
 */
const REQUIRED_CREDENTIALS: Record<string, string[]> = {
  sandbox: ["api_key"],
  ratehawk: ["key_id", "api_key"],
  hotelbeds: ["api_key", "secret"],
  webbeds: ["username", "password", "endpoint"],
  tbo: ["username", "password", "endpoint"],
  itrip: ["api_key", "client_id"],
  within_earth: ["api_key", "secret"],
};

export default async function SuppliersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!can(user, "settings.suppliers.manage")) forbidden();

  const t = await getTranslations("suppliers");
  const supabase = await createClient();

  const { data: integrations } = await supabase
    .from("supplier_integrations")
    .select(
      `provider_key, display_name_ar, display_name_en, description_ar, description_en,
       is_enabled, environment, last_tested_at, last_test_ok, last_test_message,
       supplier_credentials(credential_key, updated_at)`,
    )
    .order("priority");

  const adapters = new Set(knownProviderKeys());

  const rows: SupplierRow[] = (integrations ?? []).map((s) => ({
    providerKey: s.provider_key,
    displayNameAr: s.display_name_ar,
    displayNameEn: s.display_name_en,
    descriptionAr: s.description_ar,
    descriptionEn: s.description_en,
    isEnabled: s.is_enabled,
    environment: s.environment,
    lastTestedAt: s.last_tested_at,
    lastTestOk: s.last_test_ok,
    lastTestMessage: s.last_test_message,
    hasAdapter: adapters.has(s.provider_key),
    credentials: (s.supplier_credentials ?? []).map((c) => ({
      credentialKey: c.credential_key,
      updatedAt: c.updated_at,
    })),
    requiredKeys: REQUIRED_CREDENTIALS[s.provider_key] ?? ["api_key"],
  }));

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("title")}</h1>
        <p className="max-w-prose text-sm text-ink-muted">{t("description")}</p>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center text-sm text-ink-muted">{t("empty")}</CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((s) => (
            <SupplierCard key={s.providerKey} supplier={s} locale={locale} />
          ))}
        </div>
      )}

      <Card>
        <CardHeader title={t("internalTitle")} description={t("internalDescription")} />
      </Card>
    </main>
  );
}
