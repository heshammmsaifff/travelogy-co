import { type NextRequest } from "next/server";
import { authenticateB2BRequest } from "@/modules/b2b-api/infrastructure/api-auth.guard";
import { b2bError, b2bSuccess } from "@/modules/b2b-api/infrastructure/api-response";
import {
  B2BApiError,
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
    // The key id, not the agency id: the database resolves the agency from it.
    const booking = await createB2BReservation(parsed.data, auth.context.keyId);
    return b2bSuccess(booking, {
      status: 201,
      context: auth.context,
    });
  } catch (err) {
    if (err instanceof B2BApiError) {
      return b2bError(err.code, err.message, { status: err.status, context: auth.context });
    }
    console.error("[b2b-api] POST /bookings:", err);
    return b2bError("BOOKING_FAILED", "The booking could not be created.", {
      status: 500,
      context: auth.context,
    });
  }
}
