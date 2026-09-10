"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/shared/lib/supabase/server";
import { describeDbError } from "@/shared/lib/db-error";
import { toHalfOpenRange } from "@/shared/lib/date-range";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { requirePermission } from "@/modules/auth/infrastructure/guard";
import {
  createTransferBookingSchema,
  transferRateSchema,
  transferRouteSchema,
  vehicleTypeSchema,
} from "@/modules/transfers/application/schemas";

/**
 * Transfer mutations (CLAUDE.md §13, Phase 8a).
 *
 * Inventory is ordinary table work behind `transfers.manage`, with RLS as the
 * real boundary. Booking is not: `create_transfer_booking` re-derives the
 * price, checks credit and writes the cost row in one transaction, and there
 * is no INSERT policy on `bookings` at all — so this is the only path, exactly
 * as it is for a hotel booking (§15, 10.5).
 */

export type Result =
  | { ok: true; messageKey: string; bookingId?: string; reference?: string }
  | { ok: false; errorKey: string; detail?: string };

const FORBIDDEN: Result = { ok: false, errorKey: "access.errors.forbidden" };

function invalid(issue: string | undefined): Result {
  return { ok: false, errorKey: "transfers.errors.invalidInput", detail: issue };
}

function revalidateInventory() {
  revalidatePath("/[locale]/admin/transfers", "page");
  revalidatePath("/[locale]/agent/transfers", "page");
}

// ---------------------------------------------------------------- vehicles

export async function saveVehicleTypeAction(formData: FormData): Promise<Result> {
  try {
    await requirePermission("transfers.manage");
  } catch {
    return FORBIDDEN;
  }

  const parsed = vehicleTypeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);

  const d = parsed.data;
  const payload = {
    code: d.code,
    name_ar: d.nameAr,
    name_en: d.nameEn,
    max_passengers: d.maxPassengers,
    max_luggage: d.maxLuggage,
    description_ar: d.descriptionAr ?? null,
    description_en: d.descriptionEn ?? null,
    is_active: d.isActive,
  };

  const supabase = await createClient();
  const { error } = d.id
    ? await supabase.from("vehicle_types").update(payload).eq("id", d.id)
    : await supabase.from("vehicle_types").insert(payload);

  if (error) {
    const message = describeDbError(error);
    if (/duplicate key|vehicle_types_code_key/i.test(message)) {
      return { ok: false, errorKey: "transfers.errors.duplicate" };
    }
    console.error("[transfers] vehicle save failed:", message);
    return { ok: false, errorKey: "transfers.errors.saveFailed" };
  }

  revalidateInventory();
  return { ok: true, messageKey: "transfers.saved" };
}

export async function deleteVehicleTypeAction(id: string): Promise<Result> {
  try {
    await requirePermission("transfers.manage");
  } catch {
    return FORBIDDEN;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("vehicle_types").delete().eq("id", id);
  if (error) {
    console.error("[transfers] vehicle delete failed:", describeDbError(error));
    return { ok: false, errorKey: "transfers.errors.saveFailed" };
  }

  revalidateInventory();
  return { ok: true, messageKey: "transfers.deleted" };
}

// ------------------------------------------------------------------ routes

export async function saveTransferRouteAction(formData: FormData): Promise<Result> {
  try {
    await requirePermission("transfers.manage");
  } catch {
    return FORBIDDEN;
  }

  const parsed = transferRouteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);

  const d = parsed.data;
  const payload = {
    code: d.code,
    country_code: d.countryCode,
    city_ar: d.cityAr,
    city_en: d.cityEn,
    from_name_ar: d.fromNameAr,
    from_name_en: d.fromNameEn,
    to_name_ar: d.toNameAr,
    to_name_en: d.toNameEn,
    direction: d.direction,
    duration_minutes: d.durationMinutes ?? null,
    distance_km: d.distanceKm ?? null,
    is_active: d.isActive,
  };

  const supabase = await createClient();
  const { error } = d.id
    ? await supabase.from("transfer_routes").update(payload).eq("id", d.id)
    : await supabase.from("transfer_routes").insert(payload);

  if (error) {
    const message = describeDbError(error);
    if (/duplicate key|transfer_routes_code_key/i.test(message)) {
      return { ok: false, errorKey: "transfers.errors.duplicate" };
    }
    console.error("[transfers] route save failed:", message);
    return { ok: false, errorKey: "transfers.errors.saveFailed" };
  }

  revalidateInventory();
  return { ok: true, messageKey: "transfers.saved" };
}

export async function deleteTransferRouteAction(id: string): Promise<Result> {
  try {
    await requirePermission("transfers.manage");
  } catch {
    return FORBIDDEN;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("transfer_routes").delete().eq("id", id);
  if (error) {
    console.error("[transfers] route delete failed:", describeDbError(error));
    return { ok: false, errorKey: "transfers.errors.saveFailed" };
  }

  revalidateInventory();
  return { ok: true, messageKey: "transfers.deleted" };
}

// ------------------------------------------------------------------- rates

export async function saveTransferRateAction(formData: FormData): Promise<Result> {
  try {
    await requirePermission("transfers.manage");
  } catch {
    return FORBIDDEN;
  }

  const parsed = transferRateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);

  const d = parsed.data;
  const payload = {
    route_id: d.routeId,
    vehicle_type_id: d.vehicleTypeId,
    price_per_vehicle: d.pricePerVehicle,
    currency_code: d.currencyCode,
    // The admin typed the last valid DAY; the database stores [from, to+1).
    valid_period: toHalfOpenRange(d.validFrom, d.validTo),
    is_closed: d.isClosed,
  };

  const supabase = await createClient();
  const { error } = d.id
    ? await supabase.from("transfer_rates").update(payload).eq("id", d.id)
    : await supabase.from("transfer_rates").insert(payload);

  if (error) {
    const message = describeDbError(error);
    // The EXCLUDE constraint is the one refusal an admin can act on: two rates
    // covering the same day would mean a transfer charged whichever price a
    // query happened to return first (§15, 6.2).
    if (/transfer_rates_no_overlap|conflicting key value|exclusion constraint/i.test(message)) {
      return { ok: false, errorKey: "transfers.errors.overlap" };
    }
    console.error("[transfers] rate save failed:", message);
    return { ok: false, errorKey: "transfers.errors.saveFailed" };
  }

  revalidateInventory();
  return { ok: true, messageKey: "transfers.saved" };
}

export async function deleteTransferRateAction(id: string): Promise<Result> {
  try {
    await requirePermission("transfers.manage");
  } catch {
    return FORBIDDEN;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("transfer_rates").delete().eq("id", id);
  if (error) {
    console.error("[transfers] rate delete failed:", describeDbError(error));
    return { ok: false, errorKey: "transfers.errors.saveFailed" };
  }

  revalidateInventory();
  return { ok: true, messageKey: "transfers.deleted" };
}

// ----------------------------------------------------------------- booking

/**
 * Maps the database's refusals onto messages an agent can act on.
 *
 * Same shape as the hotel path's, and for the same reason: a generic failure
 * sends someone to retry something that was never going to succeed.
 */
function describeBookingFailure(error: unknown): Result {
  const message = describeDbError(error);
  if (/credit limit/i.test(message)) {
    return { ok: false, errorKey: "transfers.errors.creditExceeded" };
  }
  if (/no longer available/i.test(message)) {
    return { ok: false, errorKey: "transfers.errors.unavailable" };
  }
  if (/past date/i.test(message)) {
    return { ok: false, errorKey: "transfers.errors.pastDate" };
  }
  const promo = /Promotion code cannot be used: (\w+)/i.exec(message);
  if (promo) {
    return { ok: false, errorKey: "bookings.errors.promoRejected", detail: promo[1] };
  }
  console.error("[transfers] create_transfer_booking failed:", message);
  return { ok: false, errorKey: "transfers.errors.createFailed" };
}

export async function createTransferBookingAction(formData: FormData): Promise<Result> {
  const user = await getCurrentUser();
  if (!user || user.status !== "active" || user.role.scope !== "agent" || !user.agency) {
    return FORBIDDEN;
  }

  const parsed = createTransferBookingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);

  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_transfer_booking", {
    p_route_id: d.routeId,
    p_vehicle_type_id: d.vehicleTypeId,
    p_date: d.date,
    p_passengers: d.passengers,
    p_vehicles: d.vehicles,
    p_guest_name: d.leadGuestName,
    p_guest_email: d.leadGuestEmail,
    p_guest_phone: d.leadGuestPhone,
    p_pickup_time: d.pickupTime,
    p_flight_number: d.flightNumber,
    p_pickup_notes: d.pickupNotes,
    p_promo_code: d.promoCode,
  });

  if (error) return describeBookingFailure(error);

  const created = data?.[0];
  if (!created) return { ok: false, errorKey: "transfers.errors.createFailed" };

  // A transfer is a booking like any other, so the same pages go stale.
  revalidatePath("/[locale]/agent/bookings", "page");
  revalidatePath("/[locale]/agent", "page");
  revalidatePath("/[locale]/agent/statement", "page");
  revalidatePath("/[locale]/admin/bookings", "page");

  return {
    ok: true,
    messageKey: "transfers.created",
    bookingId: created.booking_id,
    reference: created.reference,
  };
}
