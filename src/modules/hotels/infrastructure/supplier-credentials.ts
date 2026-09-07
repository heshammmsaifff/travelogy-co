import "server-only";

import { createServiceRoleClient } from "@/shared/lib/supabase/server";

/**
 * Server-only access to supplier credentials (CLAUDE.md §9).
 *
 * `read_supplier_credential` is revoked from every client role and re-checks
 * that the caller is the service role, so this module is the ONLY path from
 * the application to a decrypted supplier secret. Import it from a provider
 * adapter and nowhere else.
 *
 * Nothing here logs a value, and nothing returns one to a caller that could
 * serialise it to the browser — the adapters use them to sign outbound
 * requests and discard them.
 */

export async function readSupplierCredential(
  providerKey: string,
  credentialKey: string,
): Promise<string | null> {
  const admin = createServiceRoleClient();

  const { data, error } = await admin.rpc("read_supplier_credential", {
    p_provider_key: providerKey,
    p_credential_key: credentialKey,
  });

  if (error) {
    // The message is safe to log — it never contains the secret, only why the
    // lookup failed.
    console.error(
      `[supplier-credentials] Could not read ${providerKey}.${credentialKey}:`,
      error.message,
    );
    return null;
  }

  return data ?? null;
}

/**
 * Which credentials a provider has stored, and when each changed.
 *
 * Returns no values — this is what the back-office screen renders, so it must
 * be impossible for it to surface a secret even by mistake.
 */
export async function listCredentialStatus(providerKey: string) {
  const admin = createServiceRoleClient();

  const { data } = await admin
    .from("supplier_credentials")
    .select("credential_key, updated_at, supplier_integrations!inner(provider_key)")
    .eq("supplier_integrations.provider_key", providerKey);

  return (data ?? []).map((c) => ({
    credentialKey: c.credential_key,
    updatedAt: c.updated_at,
  }));
}
