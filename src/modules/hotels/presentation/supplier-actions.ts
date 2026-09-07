"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, createServiceRoleClient } from "@/shared/lib/supabase/server";
import { describeDbError } from "@/shared/lib/db-error";
import { requirePermission } from "@/modules/auth/infrastructure/guard";
import { getProvider } from "@/modules/hotels/infrastructure/providers/registry";

/**
 * Supplier integration actions (CLAUDE.md §9).
 *
 * Credential writes go through `set_supplier_credential`, which puts the value
 * straight into Vault. The plaintext exists only as an argument in flight; it
 * is never stored in the `public` schema, never returned, and never logged.
 */

export type Result =
  | { ok: true; messageKey: string; detail?: string }
  | { ok: false; errorKey: string; detail?: string };

const FORBIDDEN: Result = { ok: false, errorKey: "access.errors.forbidden" };

const credentialSchema = z.object({
  providerKey: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{2,30}$/),
  credentialKey: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{2,40}$/),
  value: z.string().min(1, "suppliers.validation.valueRequired").max(2000),
});

function revalidateSuppliers() {
  revalidatePath("/[locale]/admin/settings/suppliers", "page");
}

export async function setCredentialAction(formData: FormData): Promise<Result> {
  try {
    await requirePermission("settings.suppliers.manage");
  } catch {
    return FORBIDDEN;
  }

  const parsed = credentialSchema.safeParse({
    providerKey: formData.get("providerKey"),
    credentialKey: formData.get("credentialKey"),
    value: formData.get("value"),
  });
  if (!parsed.success) return { ok: false, errorKey: "suppliers.errors.invalidCredential" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_supplier_credential", {
    p_provider_key: parsed.data.providerKey,
    p_credential_key: parsed.data.credentialKey,
    p_value: parsed.data.value,
  });

  if (error) {
    // Log the failure reason but never the value that was being stored.
    console.error("[suppliers] set_supplier_credential failed:", describeDbError(error));
    return { ok: false, errorKey: "suppliers.errors.saveFailed" };
  }

  revalidateSuppliers();
  return { ok: true, messageKey: "suppliers.credentialSaved" };
}

export async function clearCredentialAction(
  providerKey: string,
  credentialKey: string,
): Promise<Result> {
  try {
    await requirePermission("settings.suppliers.manage");
  } catch {
    return FORBIDDEN;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("clear_supplier_credential", {
    p_provider_key: providerKey,
    p_credential_key: credentialKey,
  });

  if (error) return { ok: false, errorKey: "suppliers.errors.saveFailed" };

  revalidateSuppliers();
  return { ok: true, messageKey: "suppliers.credentialCleared" };
}

export async function setSupplierEnabledAction(
  providerKey: string,
  isEnabled: boolean,
): Promise<Result> {
  let actor;
  try {
    actor = await requirePermission("settings.suppliers.manage");
  } catch {
    return FORBIDDEN;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("supplier_integrations")
    .update({ is_enabled: isEnabled, updated_by: actor.id })
    .eq("provider_key", providerKey);

  if (error) return { ok: false, errorKey: "suppliers.errors.saveFailed" };

  revalidateSuppliers();
  return { ok: true, messageKey: isEnabled ? "suppliers.enabled" : "suppliers.disabled" };
}

export async function setSupplierEnvironmentAction(
  providerKey: string,
  environment: "sandbox" | "production",
): Promise<Result> {
  try {
    await requirePermission("settings.suppliers.manage");
  } catch {
    return FORBIDDEN;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("supplier_integrations")
    .update({ environment })
    .eq("provider_key", providerKey);

  if (error) return { ok: false, errorKey: "suppliers.errors.saveFailed" };

  revalidateSuppliers();
  return { ok: true, messageKey: "suppliers.environmentChanged" };
}

/**
 * Runs the adapter's own connection test and records the outcome.
 *
 * This is what makes "I entered a key" and "the key works" different states an
 * admin can tell apart — without it, a wrong credential would only surface as
 * an empty search much later.
 */
export async function testSupplierAction(providerKey: string): Promise<Result> {
  try {
    await requirePermission("settings.suppliers.manage");
  } catch {
    return FORBIDDEN;
  }

  const provider = getProvider(providerKey);
  if (!provider) return { ok: false, errorKey: "suppliers.errors.noAdapter" };

  let outcome: { ok: boolean; message: string };
  try {
    outcome = await provider.testConnection();
  } catch (error) {
    outcome = { ok: false, message: error instanceof Error ? error.message : String(error) };
  }

  // Written with the service role: the result belongs to the integration
  // record regardless of which staff member ran the test.
  const admin = createServiceRoleClient();
  await admin
    .from("supplier_integrations")
    .update({
      last_tested_at: new Date().toISOString(),
      last_test_ok: outcome.ok,
      last_test_message: outcome.message.slice(0, 500),
    })
    .eq("provider_key", providerKey);

  revalidateSuppliers();

  return outcome.ok
    ? { ok: true, messageKey: "suppliers.testPassed", detail: outcome.message }
    : { ok: false, errorKey: "suppliers.testFailed", detail: outcome.message };
}

// ------------------------------------------------------------------ markup

const markupSchema = z
  .object({
    ruleId: z.string().uuid().optional().or(z.literal("")),
    scope: z.enum(["global", "agency", "hotel", "agency_hotel"]),
    agencyId: z.string().uuid().optional().or(z.literal("")),
    hotelId: z.string().uuid().optional().or(z.literal("")),
    markupType: z.enum(["percentage", "fixed"]),
    markupValue: z.coerce.number().min(0).max(9_999_999),
    note: z.string().trim().max(300).optional().or(z.literal("")),
  })
  .refine((d) => d.markupType !== "percentage" || d.markupValue <= 100, {
    message: "hotels.validation.percentageOver100",
    path: ["markupValue"],
  })
  // Mirrors the database CHECK so the user gets a field message, not a
  // constraint violation.
  .refine(
    (d) =>
      (d.scope === "global" && !d.agencyId && !d.hotelId) ||
      (d.scope === "agency" && !!d.agencyId && !d.hotelId) ||
      (d.scope === "hotel" && !d.agencyId && !!d.hotelId) ||
      (d.scope === "agency_hotel" && !!d.agencyId && !!d.hotelId),
    { message: "markup.validation.scopeMismatch", path: ["scope"] },
  );

export async function saveMarkupRuleAction(formData: FormData): Promise<Result> {
  let actor;
  try {
    actor = await requirePermission("settings.markup.manage");
  } catch {
    return FORBIDDEN;
  }

  const parsed = markupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      errorKey: "access.errors.invalidInput",
      detail: parsed.error.issues[0]?.message,
    };
  }

  const d = parsed.data;
  const supabase = await createClient();

  const payload = {
    scope: d.scope,
    agency_id: d.agencyId || null,
    hotel_id: d.hotelId || null,
    markup_type: d.markupType,
    markup_value: d.markupValue,
    note: d.note || null,
    created_by: actor.id,
  };

  const { error } = d.ruleId
    ? await supabase.from("markup_rules").update(payload).eq("id", d.ruleId)
    : await supabase.from("markup_rules").insert(payload);

  if (error) {
    const message = describeDbError(error);
    if (/markup_rules_unique/.test(message)) {
      return { ok: false, errorKey: "markup.errors.duplicateScope" };
    }
    return { ok: false, errorKey: "markup.errors.saveFailed" };
  }

  revalidatePath("/[locale]/admin/settings/markup", "page");
  return { ok: true, messageKey: "markup.saved" };
}

export async function deleteMarkupRuleAction(ruleId: string): Promise<Result> {
  try {
    await requirePermission("settings.markup.manage");
  } catch {
    return FORBIDDEN;
  }

  const supabase = await createClient();

  // Removing the global rule would silently sell at cost. Refuse it.
  const { data: rule } = await supabase
    .from("markup_rules")
    .select("scope")
    .eq("id", ruleId)
    .maybeSingle();

  if (rule?.scope === "global") return { ok: false, errorKey: "markup.errors.cannotDeleteGlobal" };

  const { error } = await supabase.from("markup_rules").delete().eq("id", ruleId);
  if (error) return { ok: false, errorKey: "markup.errors.saveFailed" };

  revalidatePath("/[locale]/admin/settings/markup", "page");
  return { ok: true, messageKey: "markup.deleted" };
}
