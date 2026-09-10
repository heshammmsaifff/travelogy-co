"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/shared/lib/supabase/server";
import { describeDbError } from "@/shared/lib/db-error";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { requirePermission } from "@/modules/auth/infrastructure/guard";

/**
 * Booking mutations (CLAUDE.md §13, Phase 5a).
 *
 * Every one of these is a thin wrapper over a database function. That is
 * deliberate: pricing, the credit rule, the inventory hold and the state
 * machine all live in `create_booking` / `confirm_booking` / `cancel_booking`,
 * where they run in one transaction and cannot be reached around. This layer
 * validates input, re-checks the caller (§12), and translates the database's
 * error codes into messages a person can act on.
 */

export type Result =
  | { ok: true; messageKey: string; bookingId?: string; reference?: string }
  | { ok: false; errorKey: string; detail?: string };

const FORBIDDEN: Result = { ok: false, errorKey: "access.errors.forbidden" };

const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional(),
  );

const createSchema = z.object({
  roomTypeId: z.string().uuid(),
  ratePlanId: z.string().uuid(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.coerce.number().int().min(1).max(20),
  children: z.coerce.number().int().min(0).max(10),
  rooms: z.coerce.number().int().min(1).max(10),
  leadGuestName: z.string().trim().min(2).max(200),
  leadGuestEmail: optionalText(200),
  leadGuestPhone: optionalText(40),
  specialRequests: optionalText(1000),
  quotationId: z.string().uuid().optional().or(z.literal("")),
  promoCode: optionalText(30),
});

function revalidateBookings(id?: string) {
  revalidatePath("/[locale]/agent/bookings", "page");
  revalidatePath("/[locale]/agent", "page");
  revalidatePath("/[locale]/admin/bookings", "page");
  if (id) {
    revalidatePath("/[locale]/agent/bookings/[id]", "page");
    revalidatePath("/[locale]/admin/bookings/[id]", "page");
  }
}

/**
 * Maps the database's own error codes onto messages.
 *
 * `create_booking` raises P0002 for "the offer moved" and P0003 for "over the
 * credit limit". Those are the two failures an agent can actually do something
 * about, so they get their own wording instead of a shared "it didn't work".
 */
function describeBookingFailure(error: unknown): Result {
  const message = describeDbError(error);
  if (/credit limit/i.test(message)) {
    return { ok: false, errorKey: "bookings.errors.creditExceeded" };
  }
  if (/no longer available|not loaded/i.test(message)) {
    return { ok: false, errorKey: "bookings.errors.unavailable" };
  }
  // The database names WHY a code was refused; passing that through beats a
  // generic failure the agent cannot act on.
  const promo = /Promotion code cannot be used: (\w+)/i.exec(message);
  if (promo) {
    return { ok: false, errorKey: "bookings.errors.promoRejected", detail: promo[1] };
  }
  console.error("[bookings] create_booking failed:", message);
  return { ok: false, errorKey: "bookings.errors.createFailed" };
}

export async function createBookingAction(formData: FormData): Promise<Result> {
  const user = await getCurrentUser();
  if (!user || user.status !== "active" || user.role.scope !== "agent" || !user.agency) {
    return FORBIDDEN;
  }

  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      errorKey: "bookings.errors.invalidInput",
      detail: parsed.error.issues[0]?.message,
    };
  }

  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_booking", {
    p_room_type_id: d.roomTypeId,
    p_rate_plan_id: d.ratePlanId,
    p_check_in: d.checkIn,
    p_check_out: d.checkOut,
    p_adults: d.adults,
    p_children: d.children,
    p_rooms: d.rooms,
    p_guest_name: d.leadGuestName,
    p_guest_email: d.leadGuestEmail,
    p_guest_phone: d.leadGuestPhone,
    p_requests: d.specialRequests,
    p_quotation_id: d.quotationId || undefined,
    p_promo_code: d.promoCode,
  });

  if (error) return describeBookingFailure(error);

  const created = data?.[0];
  if (!created) return { ok: false, errorKey: "bookings.errors.createFailed" };

  revalidateBookings(created.booking_id);
  return {
    ok: true,
    messageKey: "bookings.created_",
    bookingId: created.booking_id,
    reference: created.reference,
  };
}

export async function confirmBookingAction(bookingId: string): Promise<Result> {
  try {
    await requirePermission("bookings.confirm");
  } catch {
    return FORBIDDEN;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_booking", { p_booking_id: bookingId });
  if (error) {
    console.error("[bookings] confirm failed:", describeDbError(error));
    return { ok: false, errorKey: "bookings.errors.actionFailed" };
  }

  revalidateBookings(bookingId);
  return { ok: true, messageKey: "bookings.confirmed" };
}

export async function completeBookingAction(bookingId: string): Promise<Result> {
  try {
    await requirePermission("bookings.confirm");
  } catch {
    return FORBIDDEN;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_booking", { p_booking_id: bookingId });
  if (error) {
    const message = describeDbError(error);
    console.error("[bookings] complete failed:", message);
    return { ok: false, errorKey: "bookings.errors.actionFailed", detail: message };
  }

  revalidateBookings(bookingId);
  return { ok: true, messageKey: "bookings.completed" };
}

/**
 * Cancelling is open to both sides, so this does NOT demand a permission: an
 * agent cancelling their own booking is a normal thing to do. The database
 * function makes the decision — it allows the holder of `bookings.cancel` OR
 * a member of the owning agency, and refuses everyone else.
 */
export async function cancelBookingAction(bookingId: string, reason: string): Promise<Result> {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") return FORBIDDEN;

  const trimmed = reason.trim().slice(0, 500);
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_booking", {
    p_booking_id: bookingId,
    p_reason: trimmed || undefined,
  });

  if (error) {
    const message = describeDbError(error);
    console.error("[bookings] cancel failed:", message);
    return { ok: false, errorKey: "bookings.errors.actionFailed", detail: message };
  }

  revalidateBookings(bookingId);
  return { ok: true, messageKey: "bookings.cancelled" };
}
