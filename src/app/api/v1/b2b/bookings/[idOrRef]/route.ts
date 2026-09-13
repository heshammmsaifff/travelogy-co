import { type NextRequest } from "next/server";
import { authenticateB2BRequest } from "@/modules/b2b-api/infrastructure/api-auth.guard";
import { b2bError, b2bSuccess } from "@/modules/b2b-api/infrastructure/api-response";
import { B2BApiError, getB2BBooking } from "@/modules/b2b-api/infrastructure/b2b-bookings.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ idOrRef: string }> },
) {
  const auth = await authenticateB2BRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { idOrRef } = await params;
  if (!idOrRef) {
    return b2bError("PARAM_REQUIRED", "Booking ID or reference must be provided.", {
      status: 400,
      context: auth.context,
    });
  }

  try {
    const booking = await getB2BBooking(idOrRef, auth.context.agencyId);
    if (!booking) {
      return b2bError("BOOKING_NOT_FOUND", "Booking not found for your agency.", {
        status: 404,
        context: auth.context,
      });
    }

    return b2bSuccess(booking, { context: auth.context });
  } catch (err) {
    if (err instanceof B2BApiError) {
      return b2bError(err.code, err.message, { status: err.status, context: auth.context });
    }
    console.error("[b2b-api] GET /bookings/:id:", err);
    return b2bError("FETCH_FAILED", "The booking could not be retrieved.", {
      status: 500,
      context: auth.context,
    });
  }
}
