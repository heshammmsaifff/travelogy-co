import { type NextRequest } from "next/server";
import { z } from "zod";
import { authenticateB2BRequest } from "@/modules/b2b-api/infrastructure/api-auth.guard";
import { b2bError, b2bSuccess } from "@/modules/b2b-api/infrastructure/api-response";
import { B2BApiError } from "@/modules/b2b-api/infrastructure/b2b-bookings.service";
import { searchB2BHotels } from "@/modules/b2b-api/infrastructure/b2b-hotels.service";

const searchParamsSchema = z.object({
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "checkIn must be YYYY-MM-DD"),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "checkOut must be YYYY-MM-DD"),
  adults: z.coerce.number().int().min(1).max(10).default(2),
  children: z.coerce.number().int().min(0).max(6).default(0),
  rooms: z.coerce.number().int().min(1).max(9).default(1),
  city: z.string().optional(),
  countryCode: z.string().length(2).optional(),
  q: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await authenticateB2BRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { searchParams } = request.nextUrl;
  const rawParams = {
    checkIn: searchParams.get("checkIn") || undefined,
    checkOut: searchParams.get("checkOut") || undefined,
    adults: searchParams.get("adults") || undefined,
    children: searchParams.get("children") || undefined,
    rooms: searchParams.get("rooms") || undefined,
    city: searchParams.get("city") || undefined,
    countryCode: searchParams.get("countryCode") || undefined,
    q: searchParams.get("q") || undefined,
  };

  const parsed = searchParamsSchema.safeParse(rawParams);
  if (!parsed.success) {
    return b2bError(
      "INVALID_QUERY_PARAMS",
      "Search parameters validation failed.",
      {
        status: 400,
        context: auth.context,
        details: parsed.error.format(),
      },
    );
  }

  const { data } = parsed;
  if (data.checkIn >= data.checkOut) {
    return b2bError(
      "INVALID_DATES",
      "checkIn date must precede checkOut date.",
      { status: 400, context: auth.context },
    );
  }

  try {
    const { hotels, unavailableSuppliers } = await searchB2BHotels(
      {
        checkIn: data.checkIn,
        checkOut: data.checkOut,
        adults: data.adults,
        children: data.children,
        rooms: data.rooms,
        city: data.city,
        countryCode: data.countryCode,
        query: data.q,
      },
      auth.context.agencyId,
    );

    return b2bSuccess(hotels, {
      context: auth.context,
      meta: {
        totalHotels: hotels.length,
        criteria: data,
        // True when a supplier failed to answer: fewer hotels than exist, not "sold out".
        partialResults: unavailableSuppliers.length > 0,
        unavailableSuppliers,
      },
    });
  } catch (err) {
    if (err instanceof B2BApiError) {
      return b2bError(err.code, err.message, { status: err.status, context: auth.context });
    }
    console.error("[b2b-api] GET /hotels/search:", err);
    return b2bError("SEARCH_FAILED", "Hotel search failed. Please retry.", {
      status: 500,
      context: auth.context,
    });
  }
}
