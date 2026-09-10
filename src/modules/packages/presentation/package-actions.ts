"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/shared/lib/supabase/server";
import { describeDbError } from "@/shared/lib/db-error";
import { toHalfOpenRange } from "@/shared/lib/date-range";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { requirePermission } from "@/modules/auth/infrastructure/guard";
import {
  createPackageBookingSchema,
  packageDaySchema,
  packageDepartureSchema,
  packageRateSchema,
  packageSchema,
} from "@/modules/packages/application/schemas";

/**
 * Package mutations (CLAUDE.md §13, Phase 8c).
 *
 * Inventory is ordinary table work behind `packages.manage`, with RLS as the
 * real boundary. Booking is not: `create_package_booking` re-derives the price
 * per occupancy, checks credit, holds the seats and captures the cost in one
 * transaction, and there is no INSERT policy on `bookings` at all (§15, 10.5).
 */

export type Result =
  | { ok: true; messageKey: string; bookingId?: string; reference?: string; packageId?: string }
  | { ok: false; errorKey: string; detail?: string };

const FORBIDDEN: Result = { ok: false, errorKey: "access.errors.forbidden" };

function invalid(issue: string | undefined): Result {
  return { ok: false, errorKey: "packages.errors.invalidInput", detail: issue };
}

function revalidatePackages(packageId?: string) {
  revalidatePath("/[locale]/admin/packages", "page");
  revalidatePath("/[locale]/agent/packages", "page");
  if (packageId) revalidatePath("/[locale]/admin/packages/[id]", "page");
}

// ---------------------------------------------------------------- packages

export async function savePackageAction(formData: FormData): Promise<Result> {
  try {
    await requirePermission("packages.manage");
  } catch {
    return FORBIDDEN;
  }

  const parsed = packageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);

  const d = parsed.data;
  const payload = {
    code: d.code,
    name_ar: d.nameAr,
    name_en: d.nameEn,
    summary_ar: d.summaryAr ?? null,
    summary_en: d.summaryEn ?? null,
    country_code: d.countryCode,
    city_ar: d.cityAr,
    city_en: d.cityEn,
    duration_nights: d.durationNights,
    inclusions_ar: d.inclusionsAr ?? null,
    inclusions_en: d.inclusionsEn ?? null,
    exclusions_ar: d.exclusionsAr ?? null,
    exclusions_en: d.exclusionsEn ?? null,
    status: d.status,
  };

  const supabase = await createClient();
  const { data, error } = d.id
    ? await supabase.from("packages").update(payload).eq("id", d.id).select("id").maybeSingle()
    : await supabase.from("packages").insert(payload).select("id").maybeSingle();

  if (error) {
    const message = describeDbError(error);
    if (/duplicate key|packages_code_key/i.test(message)) {
      return { ok: false, errorKey: "packages.errors.duplicate" };
    }
    console.error("[packages] save failed:", message);
    return { ok: false, errorKey: "packages.errors.saveFailed" };
  }

  revalidatePackages(data?.id ?? (d.id || undefined));
  return { ok: true, messageKey: "packages.saved", packageId: data?.id };
}

export async function deletePackageAction(id: string): Promise<Result> {
  try {
    await requirePermission("packages.manage");
  } catch {
    return FORBIDDEN;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("packages").delete().eq("id", id);
  if (error) {
    console.error("[packages] delete failed:", describeDbError(error));
    return { ok: false, errorKey: "packages.errors.saveFailed" };
  }

  revalidatePackages();
  return { ok: true, messageKey: "packages.deleted" };
}

// ---------------------------------------------------------------- the days

export async function savePackageDayAction(formData: FormData): Promise<Result> {
  try {
    await requirePermission("packages.manage");
  } catch {
    return FORBIDDEN;
  }

  const parsed = packageDaySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);

  const d = parsed.data;
  const payload = {
    package_id: d.packageId,
    day_number: d.dayNumber,
    title_ar: d.titleAr,
    title_en: d.titleEn,
    body_ar: d.bodyAr ?? null,
    body_en: d.bodyEn ?? null,
  };

  const supabase = await createClient();
  const { error } = d.id
    ? await supabase.from("package_days").update(payload).eq("id", d.id)
    : await supabase.from("package_days").insert(payload);

  if (error) {
    const message = describeDbError(error);
    if (/package_days_one_per_day|duplicate key/i.test(message)) {
      return { ok: false, errorKey: "packages.errors.duplicateDay" };
    }
    console.error("[packages] day save failed:", message);
    return { ok: false, errorKey: "packages.errors.saveFailed" };
  }

  revalidatePackages(d.packageId);
  return { ok: true, messageKey: "packages.saved" };
}

export async function deletePackageDayAction(id: string, packageId: string): Promise<Result> {
  try {
    await requirePermission("packages.manage");
  } catch {
    return FORBIDDEN;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("package_days").delete().eq("id", id);
  if (error) return { ok: false, errorKey: "packages.errors.saveFailed" };

  revalidatePackages(packageId);
  return { ok: true, messageKey: "packages.deleted" };
}

// --------------------------------------------------------------- the rates

export async function savePackageRateAction(formData: FormData): Promise<Result> {
  try {
    await requirePermission("packages.manage");
  } catch {
    return FORBIDDEN;
  }

  const parsed = packageRateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);

  const d = parsed.data;
  const payload = {
    package_id: d.packageId,
    occupancy: d.occupancy,
    net_per_person: d.netPerPerson,
    currency_code: d.currencyCode,
    // The admin typed the last valid DEPARTURE day; the database stores
    // [from, to+1) so consecutive seasons meet exactly (§15, 6.3).
    valid_period: toHalfOpenRange(d.validFrom, d.validTo),
    is_closed: d.isClosed,
  };

  const supabase = await createClient();
  const { error } = d.id
    ? await supabase.from("package_rates").update(payload).eq("id", d.id)
    : await supabase.from("package_rates").insert(payload);

  if (error) {
    const message = describeDbError(error);
    // The one refusal an admin can act on: two rates covering the same
    // departure date for the same occupancy would price a tour by whichever
    // row a query returned first (§15, 6.2).
    if (/package_rates_no_overlap|conflicting key value|exclusion constraint/i.test(message)) {
      return { ok: false, errorKey: "packages.errors.overlap" };
    }
    console.error("[packages] rate save failed:", message);
    return { ok: false, errorKey: "packages.errors.saveFailed" };
  }

  revalidatePackages(d.packageId);
  return { ok: true, messageKey: "packages.saved" };
}

export async function deletePackageRateAction(id: string, packageId: string): Promise<Result> {
  try {
    await requirePermission("packages.manage");
  } catch {
    return FORBIDDEN;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("package_rates").delete().eq("id", id);
  if (error) return { ok: false, errorKey: "packages.errors.saveFailed" };

  revalidatePackages(packageId);
  return { ok: true, messageKey: "packages.deleted" };
}

// ---------------------------------------------------------- the departures

export async function savePackageDepartureAction(formData: FormData): Promise<Result> {
  try {
    await requirePermission("packages.manage");
  } catch {
    return FORBIDDEN;
  }

  const parsed = packageDepartureSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);

  const d = parsed.data;
  const payload = {
    package_id: d.packageId,
    departure_date: d.departureDate,
    // Required by the column, then immediately overwritten by the trigger from
    // the package's own length. Sending the departure date keeps the NOT NULL
    // satisfied without pretending this value means anything.
    return_date: d.departureDate,
    capacity: d.capacity,
    is_closed: d.isClosed,
    notes: d.notes ?? null,
  };

  const supabase = await createClient();
  const { error } = d.id
    ? await supabase.from("package_departures").update(payload).eq("id", d.id)
    : await supabase.from("package_departures").insert(payload);

  if (error) {
    const message = describeDbError(error);
    if (/one_per_date|duplicate key/i.test(message)) {
      return { ok: false, errorKey: "packages.errors.duplicateDeparture" };
    }
    // Lowering capacity below what is already sold is refused by the CHECK.
    if (/no_oversell/i.test(message)) {
      return { ok: false, errorKey: "packages.errors.saveFailed", detail: message };
    }
    console.error("[packages] departure save failed:", message);
    return { ok: false, errorKey: "packages.errors.saveFailed" };
  }

  revalidatePackages(d.packageId);
  return { ok: true, messageKey: "packages.saved" };
}

export async function deletePackageDepartureAction(
  id: string,
  packageId: string,
): Promise<Result> {
  try {
    await requirePermission("packages.manage");
  } catch {
    return FORBIDDEN;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("package_departures").delete().eq("id", id);
  if (error) {
    console.error("[packages] departure delete failed:", describeDbError(error));
    return { ok: false, errorKey: "packages.errors.saveFailed" };
  }

  revalidatePackages(packageId);
  return { ok: true, messageKey: "packages.deleted" };
}

// ------------------------------------------------------------- the booking

/** Each refusal the database raises is something the agent can act on. */
function describeBookingFailure(error: unknown): Result {
  const message = describeDbError(error);
  if (/credit limit/i.test(message)) {
    return { ok: false, errorKey: "packages.errors.creditExceeded" };
  }
  if (/already left/i.test(message)) {
    return { ok: false, errorKey: "packages.errors.alreadyLeft" };
  }
  if (/no longer available/i.test(message)) {
    return { ok: false, errorKey: "packages.errors.unavailable" };
  }
  if (/has no (single|double|triple|child) rate/i.test(message)) {
    return { ok: false, errorKey: "packages.errors.noRate" };
  }
  if (/at least one traveller/i.test(message)) {
    return { ok: false, errorKey: "packages.errors.noTravellers" };
  }
  const promo = /Promotion code cannot be used: (\w+)/i.exec(message);
  if (promo) {
    return { ok: false, errorKey: "bookings.errors.promoRejected", detail: promo[1] };
  }
  console.error("[packages] create_package_booking failed:", message);
  return { ok: false, errorKey: "packages.errors.createFailed" };
}

export async function createPackageBookingAction(formData: FormData): Promise<Result> {
  const user = await getCurrentUser();
  if (!user || user.status !== "active" || user.role.scope !== "agent" || !user.agency) {
    return FORBIDDEN;
  }

  const parsed = createPackageBookingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.message === "packages.errors.noTravellers") {
      return { ok: false, errorKey: "packages.errors.noTravellers" };
    }
    return invalid(issue?.message);
  }

  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_package_booking", {
    p_departure_id: d.departureId,
    p_single: d.single,
    p_double: d.double,
    p_triple: d.triple,
    p_children: d.children,
    p_guest_name: d.leadGuestName,
    p_guest_email: d.leadGuestEmail,
    p_guest_phone: d.leadGuestPhone,
    p_requests: d.specialRequests,
    p_promo_code: d.promoCode,
  });

  if (error) return describeBookingFailure(error);

  const created = data?.[0];
  if (!created) return { ok: false, errorKey: "packages.errors.createFailed" };

  // A package is a booking like any other, so the same pages go stale.
  revalidatePath("/[locale]/agent/bookings", "page");
  revalidatePath("/[locale]/agent", "page");
  revalidatePath("/[locale]/agent/statement", "page");
  revalidatePath("/[locale]/agent/packages", "page");
  revalidatePath("/[locale]/admin/bookings", "page");

  return {
    ok: true,
    messageKey: "packages.created",
    bookingId: created.booking_id,
    reference: created.reference,
  };
}
