import "server-only";

import { z } from "zod";
import { createServiceRoleClient } from "@/shared/lib/supabase/server";

export const b2bBookingPayloadSchema = z.object({
  roomTypeId: z.string().uuid("Invalid roomTypeId UUID"),
  ratePlanId: z.string().uuid("Invalid ratePlanId UUID"),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "checkIn must be YYYY-MM-DD"),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "checkOut must be YYYY-MM-DD"),
  adults: z.coerce.number().int().min(1).max(10).default(2),
  children: z.coerce.number().int().min(0).max(6).default(0),
  rooms: z.coerce.number().int().min(1).max(9).default(1),
  guest: z.object({
    name: z.string().min(2, "Guest name is required"),
    email: z.string().email("Invalid email").optional().nullable(),
    phone: z.string().min(5, "Invalid phone").optional().nullable(),
  }),
  specialRequests: z.string().max(500).optional().nullable(),
  promoCode: z.string().max(50).optional().nullable(),
  clientReference: z.string().max(100).optional().nullable(),
});

export type B2BBookingPayload = z.infer<typeof b2bBookingPayloadSchema>;

export async function createB2BReservation(payload: B2BBookingPayload, agencyId: string) {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc("create_b2b_api_booking", {
    p_agency_id: agencyId,
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

  if (error || !data || data.length === 0) {
    throw new Error(error?.message || "Failed to create booking.");
  }

  const res = data[0];
  if (!res) {
    throw new Error("No response returned from reservation service.");
  }

  return {
    bookingId: res.booking_id,
    reference: res.reference,
    status: res.status,
    currency: res.currency_code,
    totalSell: res.total_sell,
    documents: {
      voucherUrl: `/documents/bookings/${res.booking_id}/voucher`,
      invoiceUrl: `/documents/bookings/${res.booking_id}/invoice`,
    },
  };
}

export async function getB2BBooking(idOrRef: string, agencyId: string) {
  const supabase = createServiceRoleClient();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrRef);

  let query = supabase
    .from("bookings")
    .select(
      `
      id, reference, status, product_type, currency_code,
      total_sell, subtotal_sell, discount_amount, tax_amount, tax_rate_percent,
      check_in, check_out, nights, adults, children, rooms,
      lead_guest_name, lead_guest_email, lead_guest_phone, special_requests,
      created_at, confirmed_at, cancelled_at,
      booking_items(
        id, hotel_name_ar, hotel_name_en, room_name_ar, room_name_en,
        plan_name_ar, plan_name_en, meal_plan_key, is_refundable,
        rooms, nights, sell_per_night, sell_total, supplier_key
      )
    `,
    )
    .eq("agency_id", agencyId);

  query = isUuid ? query.eq("id", idOrRef) : query.eq("reference", idOrRef.toUpperCase());

  const { data: booking, error } = await query.maybeSingle();

  if (error || !booking) {
    return null;
  }

  return {
    id: booking.id,
    reference: booking.reference,
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
      subtotal: booking.subtotal_sell,
      discount: booking.discount_amount,
      taxAmount: booking.tax_amount,
      taxPercent: booking.tax_rate_percent,
      totalSell: booking.total_sell,
    },
    specialRequests: booking.special_requests,
    timestamps: {
      createdAt: booking.created_at,
      confirmedAt: booking.confirmed_at,
      cancelledAt: booking.cancelled_at,
    },
    items: booking.booking_items ?? [],
    documents: {
      voucherUrl: `/documents/bookings/${booking.id}/voucher`,
      invoiceUrl: `/documents/bookings/${booking.id}/invoice`,
    },
  };
}

export async function cancelB2BBooking(idOrRef: string, agencyId: string, reason?: string) {
  const supabase = createServiceRoleClient();
  const booking = await getB2BBooking(idOrRef, agencyId);

  if (!booking) {
    throw new Error("Booking not found or not owned by your agency.");
  }

  if (booking.status === "cancelled" || booking.status === "completed") {
    throw new Error(`Booking cannot be cancelled because its current status is '${booking.status}'.`);
  }

  const { error } = await supabase.rpc("cancel_booking", {
    p_booking_id: booking.id,
    p_reason: reason ? `B2B API: ${reason}` : "Cancelled via B2B REST API",
  });

  if (error) {
    throw new Error(error.message);
  }

  return {
    bookingId: booking.id,
    reference: booking.reference,
    status: "cancelled",
    cancelledAt: new Date().toISOString(),
  };
}

export async function getB2BAgencyBalance(agencyId: string) {
  const supabase = createServiceRoleClient();

  const { data: agency } = await supabase
    .from("agencies")
    .select("credit_limit, currency_code, name, code, status")
    .eq("id", agencyId)
    .single();

  if (!agency) {
    throw new Error("Agency record not found.");
  }

  const [{ data: outstanding }, { data: balance }] = await Promise.all([
    supabase.rpc("agency_outstanding", { p_agency_id: agencyId }),
    supabase.rpc("agency_balance", { p_agency_id: agencyId }),
  ]);

  const creditLimit = Number(agency.credit_limit || 0);
  const currentBalance = Number(balance || 0);
  const currentOutstanding = Number(outstanding || 0);
  const availableCredit = Math.max(0, creditLimit - currentBalance);

  return {
    agency: {
      name: agency.name,
      code: agency.code,
      status: agency.status,
    },
    currency: agency.currency_code,
    creditLimit,
    balance: currentBalance,
    outstandingBookings: currentOutstanding,
    availableCredit,
  };
}
