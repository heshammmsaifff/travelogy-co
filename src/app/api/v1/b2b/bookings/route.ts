import { type NextRequest } from "next/server";
import { authenticateB2BRequest } from "@/modules/b2b-api/infrastructure/api-auth.guard";
import { b2bError, b2bSuccess } from "@/modules/b2b-api/infrastructure/api-response";
import {
  b2bBookingPayloadSchema,
  createB2BReservation,
} from "@/modules/b2b-api/infrastructure/b2b-bookings.service";

export async function POST(request: NextRequest) {
  const auth = await authenticateB2BRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return b2bError("INVALID_JSON", "Request body must be valid JSON.", {
      status: 400,
      context: auth.context,
    });
  }

  const parsed = b2bBookingPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return b2bError("VALIDATION_ERROR", "Booking payload validation failed.", {
      status: 400,
      context: auth.context,
      details: parsed.error.format(),
    });
  }

  if (parsed.data.checkIn >= parsed.data.checkOut) {
    return b2bError("INVALID_DATES", "checkIn date must precede checkOut date.", {
      status: 400,
      context: auth.context,
    });
  }

  try {
    const booking = await createB2BReservation(parsed.data, auth.context.agencyId);
    return b2bSuccess(booking, {
      status: 201,
      context: auth.context,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create booking.";
    let status = 400;

    if (msg.includes("Credit limit exceeded")) {
      status = 402;
    } else if (msg.includes("allotment unavailable") || msg.includes("no longer available")) {
      status = 409;
    }

    return b2bError("BOOKING_REJECTED", msg, {
      status,
      context: auth.context,
    });
  }
}
