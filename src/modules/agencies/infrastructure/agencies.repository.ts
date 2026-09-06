import "server-only";

import { createClient } from "@/shared/lib/supabase/server";
import type { AgencyListFilters } from "@/modules/agencies/application/schemas";

/**
 * Agency read models.
 *
 * Filtering, sorting and paging are pushed into Postgres rather than done in
 * JS (CLAUDE.md §11), and every list is bounded.
 */

export const AGENCIES_PAGE_SIZE = 20;

export type AgencyListRow = {
  id: string;
  code: string;
  name: string;
  email: string;
  countryCode: string;
  city: string | null;
  status: string;
  creditLimit: number;
  currencyCode: string;
  createdAt: string;
  userCount: number;
};

export async function listAgencies(filters: AgencyListFilters) {
  const supabase = await createClient();
  const from = (filters.page - 1) * AGENCIES_PAGE_SIZE;

  let query = supabase.from("agencies").select(
    `id, code, name, email, country_code, city, status, credit_limit, currency_code, created_at,
       profiles(count)`,
    { count: "exact" },
  );

  if (filters.status) query = query.eq("status", filters.status);

  if (filters.q) {
    // Escape PostgREST's `or` delimiters so a comma or paren in the search box
    // cannot break out of the filter expression.
    const term = filters.q.replace(/[,()]/g, " ").trim();
    if (term) {
      query = query.or(`name.ilike.%${term}%,code.ilike.%${term}%,email.ilike.%${term}%`);
    }
  }

  const { data, count } = await query
    .order("created_at", { ascending: false })
    .range(from, from + AGENCIES_PAGE_SIZE - 1);

  return {
    rows: (data ?? []).map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      email: a.email,
      countryCode: a.country_code,
      city: a.city,
      status: a.status,
      creditLimit: Number(a.credit_limit),
      currencyCode: a.currency_code,
      createdAt: a.created_at,
      userCount: a.profiles?.[0]?.count ?? 0,
    })) satisfies AgencyListRow[],
    total: count ?? 0,
    pageSize: AGENCIES_PAGE_SIZE,
  };
}

export async function getAgency(id: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("agencies")
    .select(
      `id, code, name, legal_name, email, phone, website, country_code, city, address,
       commercial_reg_no, tax_id, status, credit_limit, currency_code,
       approved_at, rejected_at, rejection_reason, created_at`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;

  const { data: members } = await supabase
    .from("profiles")
    .select("id, email, full_name, status, created_at, roles!inner(key, name_ar, name_en)")
    .eq("agency_id", id)
    .order("created_at")
    .limit(50);

  return {
    id: data.id,
    code: data.code,
    name: data.name,
    legalName: data.legal_name,
    email: data.email,
    phone: data.phone,
    website: data.website,
    countryCode: data.country_code,
    city: data.city,
    address: data.address,
    commercialRegNo: data.commercial_reg_no,
    taxId: data.tax_id,
    status: data.status,
    creditLimit: Number(data.credit_limit),
    currencyCode: data.currency_code,
    approvedAt: data.approved_at,
    rejectedAt: data.rejected_at,
    rejectionReason: data.rejection_reason,
    createdAt: data.created_at,
    members: (members ?? []).map((m) => ({
      id: m.id,
      email: m.email,
      fullName: m.full_name,
      status: m.status,
      roleKey: m.roles.key,
      roleNameAr: m.roles.name_ar,
      roleNameEn: m.roles.name_en,
      createdAt: m.created_at,
    })),
  };
}

/**
 * Counts per status, for the filter chips.
 *
 * Reads the `agency_status_counts` view, so the grouping happens in Postgres
 * and the response is one row per status regardless of how many agencies exist
 * (CLAUDE.md §11). The view is `security_invoker`, so it returns only what the
 * caller is allowed to see.
 */
export async function countAgenciesByStatus(): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase.from("agency_status_counts").select("status, count");

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    if (row.status) counts[row.status] = Number(row.count ?? 0);
  }
  return counts;
}
