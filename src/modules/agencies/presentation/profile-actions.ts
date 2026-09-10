"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/shared/lib/supabase/server";
import { describeDbError } from "@/shared/lib/db-error";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";

/**
 * The agent maintaining their own company profile (CLAUDE.md §13, Phase 4).
 *
 * Only the fields a company owns are accepted here. `code`, `credit_limit`,
 * `currency_code`, `status` and the approval trail are absent from the schema
 * on purpose, and a database trigger refuses them independently — RLS grants
 * rows, not columns, which is exactly how an owner raised their own credit
 * limit in Phase 1 (§15). Two layers, because the schema alone is an
 * application-level promise.
 */

const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional(),
  );

const profileSchema = z.object({
  name: z.string().trim().min(2, "profile.errors.invalidInput").max(200),
  legalName: optionalText(200),
  phone: optionalText(40),
  website: optionalText(300),
  city: optionalText(120),
  address: optionalText(300),
  commercialRegNo: optionalText(60),
  taxId: optionalText(60),
});

export type Result =
  | { ok: true; messageKey: string }
  | { ok: false; errorKey: string; detail?: string };

export async function updateAgencyProfileAction(formData: FormData): Promise<Result> {
  const user = await getCurrentUser();
  if (!user || user.status !== "active" || user.role.scope !== "agent" || !user.agency) {
    return { ok: false, errorKey: "access.errors.forbidden" };
  }

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    legalName: formData.get("legalName"),
    phone: formData.get("phone"),
    website: formData.get("website"),
    city: formData.get("city"),
    address: formData.get("address"),
    commercialRegNo: formData.get("commercialRegNo"),
    taxId: formData.get("taxId"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      errorKey: "profile.errors.invalidInput",
      detail: parsed.error.issues[0]?.message,
    };
  }

  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("agencies")
    .update({
      name: d.name,
      legal_name: d.legalName ?? null,
      phone: d.phone ?? null,
      website: d.website ?? null,
      city: d.city ?? null,
      address: d.address ?? null,
      commercial_reg_no: d.commercialRegNo ?? null,
      tax_id: d.taxId ?? null,
    })
    // The id comes from the caller's own profile, never from the form.
    .eq("id", user.agency.id);

  if (error) {
    console.error("[profile] agency update failed:", describeDbError(error));
    return { ok: false, errorKey: "profile.errors.saveFailed" };
  }

  revalidatePath("/[locale]/agent/profile", "page");
  revalidatePath("/[locale]/agent", "page");
  return { ok: true, messageKey: "profile.saved" };
}
