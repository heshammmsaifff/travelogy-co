import "server-only";

import { createClient } from "@/shared/lib/supabase/server";

/**
 * Finance reads (CLAUDE.md §13, Phase 5b).
 *
 * Every figure here comes out of a database function. Nothing on this side
 * adds money up: a balance computed in JavaScript would be a second opinion,
 * and §10 requires exactly one — the ledger.
 */

export type StatementEntry = {
  entryDate: string;
  entryType: "booking" | "payment" | "refund";
  reference: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
  currencyCode: string;
};

export type CreditPosition = {
  creditLimit: number;
  outstanding: number;
  paid: number;
  balance: number;
  available: number;
  currencyCode: string;
};

export type ReceivableRow = CreditPosition & {
  agencyId: string;
  agencyName: string;
  agencyCode: string;
};

export async function getStatement(
  agencyId: string,
  range: { from?: string; to?: string } = {},
): Promise<StatementEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("agency_statement", {
    p_agency_id: agencyId,
    p_from: range.from,
    p_to: range.to,
  });

  // The function raises for a caller who may not see this account, which
  // arrives here as an error rather than an empty list — either way the page
  // shows nothing, and the database made the decision.
  if (error || !data) return [];

  return data.map((row) => ({
    entryDate: row.entry_date,
    entryType: row.entry_type as StatementEntry["entryType"],
    reference: row.reference,
    description: row.description,
    debit: Number(row.debit),
    credit: Number(row.credit),
    runningBalance: Number(row.running_balance),
    currencyCode: row.currency_code,
  }));
}

export async function getMyCreditPosition(): Promise<CreditPosition | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_credit_summary");
  const row = data?.[0];
  if (error || !row) return null;
  return {
    creditLimit: Number(row.credit_limit),
    outstanding: Number(row.outstanding),
    paid: Number(row.paid),
    balance: Number(row.balance),
    available: Number(row.available),
    currencyCode: row.currency_code,
  };
}

export async function getReceivables(): Promise<ReceivableRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("receivables_summary");
  if (error || !data) return [];
  return data.map((row) => ({
    agencyId: row.agency_id,
    agencyName: row.agency_name,
    agencyCode: row.agency_code,
    creditLimit: Number(row.credit_limit),
    outstanding: Number(row.outstanding),
    paid: Number(row.paid),
    balance: Number(row.balance),
    available: Number(row.credit_limit) - Number(row.balance),
    currencyCode: row.currency_code,
  }));
}

export type PromoCodeRow = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  discountType: "percentage" | "fixed" | "nights";
  discountValue: number;
  agencyId: string | null;
  minBookingTotal: number | null;
  maxDiscount: number | null;
  validFrom: string;
  validTo: string;
  maxRedemptions: number | null;
  maxPerAgency: number | null;
  timesUsed: number;
  isActive: boolean;
};

export async function listPromoCodes(): Promise<PromoCodeRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("promo_codes")
    .select(
      "id, code, name_ar, name_en, discount_type, discount_value, agency_id, min_booking_total, max_discount, valid_from, valid_to, max_redemptions, max_per_agency, times_used, is_active",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    code: r.code,
    nameAr: r.name_ar,
    nameEn: r.name_en,
    discountType: r.discount_type,
    discountValue: Number(r.discount_value),
    agencyId: r.agency_id,
    minBookingTotal: r.min_booking_total === null ? null : Number(r.min_booking_total),
    maxDiscount: r.max_discount === null ? null : Number(r.max_discount),
    validFrom: r.valid_from,
    validTo: r.valid_to,
    maxRedemptions: r.max_redemptions,
    maxPerAgency: r.max_per_agency,
    timesUsed: r.times_used,
    isActive: r.is_active,
  }));
}

export type TaxRateRow = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  percent: number;
  isDefault: boolean;
  isActive: boolean;
};

export async function listTaxRates(): Promise<TaxRateRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tax_rates")
    .select("id, code, name_ar, name_en, percent, is_default, is_active")
    .order("is_default", { ascending: false })
    .order("code");

  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    code: r.code,
    nameAr: r.name_ar,
    nameEn: r.name_en,
    percent: Number(r.percent),
    isDefault: r.is_default,
    isActive: r.is_active,
  }));
}

export type CompanyProfile = {
  legalNameAr: string;
  legalNameEn: string;
  addressAr: string | null;
  addressEn: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  taxNumber: string | null;
  commercialRegNo: string | null;
  invoiceFooterAr: string | null;
  invoiceFooterEn: string | null;
};

/**
 * The issuing company, printed on every voucher and invoice.
 *
 * The row is a singleton created by migration, so a missing one means the
 * caller could not read it rather than that it does not exist — the documents
 * fall back to the app's own name rather than rendering a blank letterhead.
 */
export async function getCompanyProfile(): Promise<CompanyProfile> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("company_profile")
    .select(
      "legal_name_ar, legal_name_en, address_ar, address_en, phone, email, website, tax_number, commercial_reg_no, invoice_footer_ar, invoice_footer_en",
    )
    .maybeSingle();

  return {
    legalNameAr: data?.legal_name_ar ?? "لاست لاين ترافل",
    legalNameEn: data?.legal_name_en ?? "Last Line Travel",
    addressAr: data?.address_ar ?? null,
    addressEn: data?.address_en ?? null,
    phone: data?.phone ?? null,
    email: data?.email ?? null,
    website: data?.website ?? null,
    taxNumber: data?.tax_number ?? null,
    commercialRegNo: data?.commercial_reg_no ?? null,
    invoiceFooterAr: data?.invoice_footer_ar ?? null,
    invoiceFooterEn: data?.invoice_footer_en ?? null,
  };
}
