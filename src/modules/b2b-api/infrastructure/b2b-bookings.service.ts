import "server-only";

import { z } from "zod";
import { createServiceRoleClient } from "@/shared/lib/supabase/server";

/**
 * A failure the API can report to a buyer system as-is: a stable machine code,
 * an HTTP status, and a message written for an integrator.
 *
 * Anything that is NOT one of these is our fault, and the route answers it
 * with a generic 500 — a raw database message is not an API contract, and can
 * describe internals no partner should see.
 */
export class B2BApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "B2BApiError";
  }
}

export const b2bBookingPayloadSchema = z.object({
  roomTypeId: z.string().uuid("Invalid roomTypeId UUID"),
  ratePlanId: z.string().uuid("Invalid ratePlanId UUID"),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "checkIn must be YYYY-MM-DD"),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "checkOut must be YYYY-MM-DD"),
  adults: z.coerce.number().int().min(1).max(10).default(2),
  children: z.coerce.number().int().min(0).max(6).default(0),
  rooms: z.coerce.number().int().min(1).max(9).default(1),
  guest: z.object({
    name: z.string().trim().min(2, "Guest name is required").max(200),
    email: z.string().email("Invalid email").optional().nullable(),
    phone: z.string().trim().min(5, "Invalid phone").max(40).optional().nullable(),
  }),
  specialRequests: z.string().max(500).optional().nullable(),
  promoCode: z.string().max(50).optional().nullable(),
  /**
   * The buyer system's own reference. Unique per agency: a retried request
   * carrying the same value is refused instead of booking twice.
   */
  clientReference: z.string().trim().min(1).max(100).optional().nullable(),
});

export type B2BBookingPayload = z.infer<typeof b2bBookingPayloadSchema>;

/**
 * Maps the SQLSTATE the booking functions raise onto the API's error codes.
 * Matching on the code rather than on message text keeps this correct when a
 * message is reworded.
 */
function mapBookingError(error: { code?: string; message: string }): B2BApiError {
  switch (error.code) {
    case "P0003":
      return new B2BApiError(
        "CREDIT_LIMIT_EXCEEDED",
        402,
        "This booking would exceed the agency credit limit.",
      );
    case "P0002":
      return new B2BApiError("OFFER_UNAVAILABLE", 409, error.message);
    case "23514":
      // `allocations_not_oversold`: another booking took the last rooms between
      // the availability check and the hold.
      return new B2BApiError(
        "OFFER_UNAVAILABLE",
        409,
        "The last rooms for this offer were taken while the request was processed.",
      );
    case "23505":
      return new B2BApiError(
        "DUPLICATE_CLIENT_REFERENCE",
        409,
        "A booking with this clientReference already exists for your agency.",
      );
    case "P0004":
      return new B2BApiError("PROMO_CODE_REJECTED", 422, error.message);
    case "22023":
      return new B2BApiError("INVALID_STAY", 400, error.message);
    case "42501":
      return new B2BApiError("FORBIDDEN", 403, "This key is not permitted to book.");
    default:
      console.error("[b2b-api] booking failed:", error.code, error.message);
      return new B2BApiError("BOOKING_FAILED", 500, "The booking could not be created.");
  }
}

/**
 * Creates a hotel booking for the agency that owns `apiKeyId`.
 *
 * The agency is NOT passed: `create_b2b_api_booking` resolves it from the key
 * inside the database, and runs the same booking implementation as the agent
 * portal — the same price re-derivation, credit check and inventory hold.
 */
export async function createB2BReservation(payload: B2BBookingPayload, apiKeyId: string) {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc("create_b2b_api_booking", {
    p_api_key_id: apiKeyId,
    p_room_type_id: payload.roomTypeId,
    p_rate_plan_id: payload.ratePlanId,
    p_check_in: payload.checkIn,
    p_check_out: payload.checkOut,
    p_adults: payload.adults,
    p_children: payload.children,
    p_rooms: payload.rooms,
    p_guest_name: payload.guest.name,
    p_guest_email: payload.guest.email ?? undefined,
    p_guest_phone: payload.guest.phone ?? undefined,
    p_requests: payload.specialRequests ?? undefined,
    p_promo_code: payload.promoCode ?? undefined,
    p_client_reference: payload.clientReference ?? undefined,
  });

  if (error) throw mapBookingError(error);

  const res = data?.[0];
  if (!res) {
    console.error("[b2b-api] create_b2b_api_booking returned no row");
    throw new B2BApiError("BOOKING_FAILED", 500, "The booking could not be created.");
  }

  return {
    bookingId: res.booking_id,
    reference: res.reference,
    status: res.status,
    currency: res.currency_code,
    totalSell: Number(res.total_sell),
    clientReference: payload.clientReference ?? null,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns null only when the booking genuinely does not exist for this agency. */
export async function getB2BBooking(idOrRef: string, agencyId: string) {
  const supabase = createServiceRoleClient();

  let query = supabase
    .from("bookings")
    .select(
      `
      id, reference, client_reference, status, product_type, currency_code,
      total_sell, subtotal_sell, discount_amount, tax_amount, tax_rate_percent,
      check_in, check_out, nights, adults, children, rooms,
      lead_guest_name, lead_guest_email, lead_guest_phone, special_requests,
      created_at, confirmed_at, cancelled_at,
      booking_items(
        id, hotel_name_ar, hotel_name_en, room_name_ar, room_name_en,
        plan_name_ar, plan_name_en, meal_plan_key, is_refundable,
        rooms, nights, sell_per_night, sell_total
      )
    `,
    )
    // Always scoped by the key's agency: another agency's booking is "not
    // found", never "forbidden", so a reference cannot be probed for.
    .eq("agency_id", agencyId);

  query = UUID_RE.test(idOrRef) ? query.eq("id", idOrRef) : query.eq("reference", idOrRef.toUpperCase());

  const { data: booking, error } = await query.maybeSingle();

  if (error) {
    // A failed read must not be reported as "no such booking" (§15, 7.6).
    console.error("[b2b-api] booking read failed:", error.message);
    throw new B2BApiError("FETCH_FAILED", 500, "The booking could not be retrieved.");
  }
  if (!booking) return null;

  return {
    id: booking.id,
    reference: booking.reference,
    clientReference: booking.client_reference,
    status: booking.status,
    productType: booking.product_type,
    stay: {
      checkIn: booking.check_in,
      checkOut: booking.check_out,
      nights: booking.nights,
      rooms: booking.rooms,
      guests: {
        adults: booking.adults,
        children: booking.children,
      },
    },
    guest: {
      name: booking.lead_guest_name,
      email: booking.lead_guest_email,
      phone: booking.lead_guest_phone,
    },
    pricing: {
      currency: booking.currency_code,
      subtotal: Number(booking.subtotal_sell),
      discount: Number(booking.discount_amount),
      taxAmount: Number(booking.tax_amount),
      taxPercent: Number(booking.tax_rate_percent),
      totalSell: Number(booking.total_sell),
    },
    specialRequests: booking.special_requests,
    timestamps: {
      createdAt: booking.created_at,
      confirmedAt: booking.confirmed_at,
      cancelledAt: booking.cancelled_at,
    },
    items: (booking.booking_items ?? []).map((item) => ({
      id: item.id,
      hotelName: { ar: item.hotel_name_ar, en: item.hotel_name_en },
      roomName: { ar: item.room_name_ar, en: item.room_name_en },
      ratePlanName: { ar: item.plan_name_ar, en: item.plan_name_en },
      mealPlan: item.meal_plan_key,
      isRefundable: item.is_refundable,
      rooms: item.rooms,
      nights: item.nights,
      sellPerNight: Number(item.sell_per_night),
      sellTotal: Number(item.sell_total),
    })),
  };
}

export async function cancelB2BBooking(idOrRef: string, agencyId: string, reason?: string) {
  const booking = await getB2BBooking(idOrRef, agencyId);

  if (!booking) {
    throw new B2BApiError("BOOKING_NOT_FOUND", 404, "Booking not found for your agency.");
  }

  if (booking.status === "cancelled" || booking.status === "completed") {
    throw new B2BApiError(
      "BOOKING_NOT_CANCELLABLE",
      409,
      `Booking cannot be cancelled because its current status is '${booking.status}'.`,
    );
  }

  // Runs as the service role: `cancel_booking` accepts a system context, and
  // ownership was established above by reading the booking through the key's
  // agency. The function releases the inventory and the credit obligation.
  const supabase = createServiceRoleClient();
  const { error } = await supabase.rpc("cancel_booking", {
    p_booking_id: booking.id,
    p_reason: reason ? `B2B API: ${reason}` : "Cancelled via B2B REST API",
  });

  if (error) {
    console.error("[b2b-api] cancel_booking failed:", error.code, error.message);
    throw new B2BApiError("CANCELLATION_FAILED", 500, "The booking could not be cancelled.");
  }

  const cancelled = await getB2BBooking(booking.id, agencyId);

  return {
    bookingId: booking.id,
    reference: booking.reference,
    status: cancelled?.status ?? "cancelled",
    cancelledAt: cancelled?.timestamps.cancelledAt ?? null,
  };
}

export async function getB2BAgencyBalance(agencyId: string) {
  const supabase = createServiceRoleClient();

  const { data: agency, error } = await supabase
    .from("agencies")
    .select("credit_limit, currency_code, name, code, status")
    .eq("id", agencyId)
    .single();

  if (error || !agency) {
    console.error("[b2b-api] agency read failed:", error?.message);
    throw new B2BApiError("BALANCE_FAILED", 500, "The account balance could not be retrieved.");
  }

  const [outstanding, balance] = await Promise.all([
    supabase.rpc("agency_outstanding", { p_agency_id: agencyId }),
    supabase.rpc("agency_balance", { p_agency_id: agencyId }),
  ]);

  if (outstanding.error || balance.error) {
    console.error(
      "[b2b-api] balance functions failed:",
      outstanding.error?.message,
      balance.error?.message,
    );
    throw new B2BApiError("BALANCE_FAILED", 500, "The account balance could not be retrieved.");
  }

  const creditLimit = Number(agency.credit_limit || 0);
  const currentBalance = Number(balance.data || 0);

  return {
    agency: {
      name: agency.name,
      code: agency.code,
      status: agency.status,
    },
    currency: agency.currency_code,
    creditLimit,
    /** What the agency owes now: standing bookings minus recorded payments. */
    balance: currentBalance,
    outstandingBookings: Number(outstanding.data || 0),
    /** The same headroom the booking function checks against (§15, 11.2). */
    availableCredit: Math.max(0, creditLimit - currentBalance),
  };
}
