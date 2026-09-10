"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/shared/lib/supabase/server";
import { describeDbError } from "@/shared/lib/db-error";
import { requirePermission } from "@/modules/auth/infrastructure/guard";

/**
 * Finance mutations (CLAUDE.md §13, Phase 5b).
 *
 * Recording a payment goes through `record_payment`, which mints the reference
 * and writes the audit row in the same transaction. There is no INSERT policy
 * on `payments` at all, so this is not merely the preferred path — it is the
 * only one (§10).
 */

export type Result =
  | { ok: true; messageKey: string }
  | { ok: false; errorKey: string; detail?: string };

const FORBIDDEN: Result = { ok: false, errorKey: "access.errors.forbidden" };

const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional(),
  );

const optionalNumber = (opts: { min?: number } = {}) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    (() => {
      let n = z.coerce.number();
      if (opts.min !== undefined) n = n.min(opts.min);
      return n.optional();
    })(),
  );

const optionalInt = () =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number().int().min(1).optional(),
  );

// ------------------------------------------------------------------ payments

const paymentSchema = z.object({
  agencyId: z.string().uuid(),
  kind: z.enum(["receipt", "refund"]),
  method: z.enum(["bank_transfer", "cheque", "cash", "adjustment"]),
  amount: z.coerce.number().positive().max(99_999_999),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  externalReference: optionalText(120),
  notes: optionalText(1000),
});

export async function recordPaymentAction(formData: FormData): Promise<Result> {
  try {
    await requirePermission("finance.payments.record");
  } catch {
    return FORBIDDEN;
  }

  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      errorKey: "finance.errors.invalidInput",
      detail: parsed.error.issues[0]?.message,
    };
  }

  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_payment", {
    p_agency_id: d.agencyId,
    p_method: d.method,
    p_amount: d.amount,
    p_paid_on: d.paidOn,
    p_kind: d.kind,
    p_external_reference: d.externalReference,
    p_notes: d.notes,
  });

  if (error) {
    console.error("[finance] record_payment failed:", describeDbError(error));
    return { ok: false, errorKey: "finance.errors.recordFailed" };
  }

  revalidatePath("/[locale]/admin/finance", "page");
  revalidatePath("/[locale]/admin/finance/[agencyId]", "page");
  revalidatePath("/[locale]/agent/statement", "page");
  revalidatePath("/[locale]/agent", "page");
  return { ok: true, messageKey: "finance.saved" };
}

// --------------------------------------------------------------- promo codes

const promoSchema = z
  .object({
    id: z.string().uuid().optional().or(z.literal("")),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9_-]{2,29}$/, "promos.errors.invalidInput"),
    nameAr: z.string().trim().min(2).max(120),
    nameEn: z.string().trim().min(2).max(120),
    discountType: z.enum(["percentage", "fixed"]),
    discountValue: z.coerce.number().min(0).max(99_999_999),
    agencyId: z.string().uuid().optional().or(z.literal("")),
    minBookingTotal: optionalNumber({ min: 0 }),
    maxDiscount: optionalNumber({ min: 0 }),
    validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    maxRedemptions: optionalInt(),
    maxPerAgency: optionalInt(),
    isActive: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  })
  .refine((d) => d.validTo >= d.validFrom, { path: ["validTo"] })
  // Mirrors the database CHECK so the user gets a field message rather than a
  // constraint violation.
  .refine((d) => d.discountType !== "percentage" || d.discountValue <= 100, {
    path: ["discountValue"],
  });

export async function savePromoCodeAction(formData: FormData): Promise<Result> {
  let actor;
  try {
    actor = await requirePermission("finance.settings.manage");
  } catch {
    return FORBIDDEN;
  }

  const parsed = promoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      errorKey: "promos.errors.invalidInput",
      detail: parsed.error.issues[0]?.message,
    };
  }

  const d = parsed.data;
  const payload = {
    code: d.code,
    name_ar: d.nameAr,
    name_en: d.nameEn,
    discount_type: d.discountType,
    discount_value: d.discountValue,
    agency_id: d.agencyId || null,
    min_booking_total: d.minBookingTotal ?? null,
    max_discount: d.maxDiscount ?? null,
    valid_from: d.validFrom,
    valid_to: d.validTo,
    max_redemptions: d.maxRedemptions ?? null,
    max_per_agency: d.maxPerAgency ?? null,
    is_active: d.isActive,
    created_by: actor.id,
  };

  const supabase = await createClient();
  const { error } = d.id
    ? await supabase.from("promo_codes").update(payload).eq("id", d.id)
    : await supabase.from("promo_codes").insert(payload);

  if (error) {
    const message = describeDbError(error);
    if (/promo_codes_code_key|duplicate key/i.test(message)) {
      return { ok: false, errorKey: "promos.errors.duplicate" };
    }
    console.error("[finance] promo save failed:", message);
    return { ok: false, errorKey: "promos.errors.saveFailed" };
  }

  revalidatePath("/[locale]/admin/settings/promo-codes", "page");
  return { ok: true, messageKey: "promos.saved" };
}

export async function deletePromoCodeAction(id: string): Promise<Result> {
  try {
    await requirePermission("finance.settings.manage");
  } catch {
    return FORBIDDEN;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("promo_codes").delete().eq("id", id);
  if (error) return { ok: false, errorKey: "promos.errors.saveFailed" };

  revalidatePath("/[locale]/admin/settings/promo-codes", "page");
  return { ok: true, messageKey: "promos.deleted" };
}

// ----------------------------------------------------------------- tax rates

const taxSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9_]{1,20}$/, "tax.errors.invalidInput"),
  nameAr: z.string().trim().min(2).max(120),
  nameEn: z.string().trim().min(2).max(120),
  percent: z.coerce.number().min(0).max(100),
  isDefault: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  isActive: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
});

export async function saveTaxRateAction(formData: FormData): Promise<Result> {
  let actor;
  try {
    actor = await requirePermission("finance.settings.manage");
  } catch {
    return FORBIDDEN;
  }

  const parsed = taxSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, errorKey: "tax.errors.invalidInput", detail: parsed.error.issues[0]?.message };
  }

  const d = parsed.data;
  const supabase = await createClient();

  // Only one row may be the default, enforced by a partial unique index. The
  // old default is cleared first so setting a new one is a single intent
  // rather than something the admin has to remember to do in two steps.
  if (d.isDefault) {
    const clear = supabase.from("tax_rates").update({ is_default: false }).eq("is_default", true);
    const { error: clearError } = d.id ? await clear.neq("id", d.id) : await clear;
    if (clearError) {
      console.error("[finance] clearing the default tax rate failed:", describeDbError(clearError));
      return { ok: false, errorKey: "tax.errors.saveFailed" };
    }
  }

  const payload = {
    code: d.code,
    name_ar: d.nameAr,
    name_en: d.nameEn,
    percent: d.percent,
    is_default: d.isDefault,
    is_active: d.isActive,
    updated_by: actor.id,
  };

  const { error } = d.id
    ? await supabase.from("tax_rates").update(payload).eq("id", d.id)
    : await supabase.from("tax_rates").insert(payload);

  if (error) {
    console.error("[finance] tax save failed:", describeDbError(error));
    return { ok: false, errorKey: "tax.errors.saveFailed" };
  }

  revalidatePath("/[locale]/admin/settings/tax", "page");
  return { ok: true, messageKey: "tax.saved" };
}

export async function deleteTaxRateAction(id: string): Promise<Result> {
  try {
    await requirePermission("finance.settings.manage");
  } catch {
    return FORBIDDEN;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tax_rates").delete().eq("id", id);
  if (error) return { ok: false, errorKey: "tax.errors.saveFailed" };

  revalidatePath("/[locale]/admin/settings/tax", "page");
  return { ok: true, messageKey: "tax.deleted" };
}

// ----------------------------------------------------------- company profile

const companySchema = z.object({
  legalNameAr: z.string().trim().min(2).max(200),
  legalNameEn: z.string().trim().min(2).max(200),
  addressAr: optionalText(300),
  addressEn: optionalText(300),
  phone: optionalText(60),
  email: optionalText(200),
  website: optionalText(200),
  taxNumber: optionalText(60),
  commercialRegNo: optionalText(60),
  invoiceFooterAr: optionalText(1000),
  invoiceFooterEn: optionalText(1000),
});

/**
 * The issuing company on every document (CLAUDE.md §13, Phase 5c).
 *
 * A singleton row created by migration, so this is always an UPDATE — there is
 * no INSERT policy, and a second row would make every document pick one.
 */
export async function saveCompanyProfileAction(formData: FormData): Promise<Result> {
  let actor;
  try {
    actor = await requirePermission("finance.settings.manage");
  } catch {
    return FORBIDDEN;
  }

  const parsed = companySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      errorKey: "companyProfile.errors.invalidInput",
      detail: parsed.error.issues[0]?.message,
    };
  }

  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("company_profile")
    .update({
      legal_name_ar: d.legalNameAr,
      legal_name_en: d.legalNameEn,
      address_ar: d.addressAr ?? null,
      address_en: d.addressEn ?? null,
      phone: d.phone ?? null,
      email: d.email ?? null,
      website: d.website ?? null,
      tax_number: d.taxNumber ?? null,
      commercial_reg_no: d.commercialRegNo ?? null,
      invoice_footer_ar: d.invoiceFooterAr ?? null,
      invoice_footer_en: d.invoiceFooterEn ?? null,
      updated_by: actor.id,
    })
    .eq("id", true);

  if (error) {
    console.error("[finance] company profile save failed:", describeDbError(error));
    return { ok: false, errorKey: "companyProfile.errors.saveFailed" };
  }

  revalidatePath("/[locale]/admin/settings/company", "page");
  return { ok: true, messageKey: "companyProfile.saved" };
}
